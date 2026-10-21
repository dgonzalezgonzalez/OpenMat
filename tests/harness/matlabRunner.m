function matlabRunner(suiteDir, outFile)
% MATLABRUNNER Execute every %% block of every .m file in SUITEDIR and emit a
% JSON report describing each block's captured output and workspace state.
%
% The report schema matches tests/harness/omRunner.ts so the two engines can be
% diffed directly:
%
%   report.scripts(i).script             - file name
%   report.scripts(i).blocks(j).name      - text after the %% marker
%   report.scripts(i).blocks(j).ok        - block evaluated without raising
%   report.scripts(i).blocks(j).outputs   - captured command-window lines
%   report.scripts(i).blocks(j).errors    - error message, if any
%   report.scripts(i).blocks(j).workspace - serialized variables
%
% Each block is executed as a real MATLAB script in the base workspace:
% top-level function definitions are hoisted to the end of the generated file
% (MATLAB's script rule) and the file is then run with `run`.
%
% Usage:  matlabRunner('tests/matlab-suite', 'out.json')

suiteDir = char(suiteDir);
if ~exist(suiteDir, 'dir')
    error('matlabRunner:suiteMissing', 'Suite directory not found: %s', suiteDir);
end

files = dir(fullfile(suiteDir, '*.m'));
files = files(~[files.isdir]);
[~, order] = sort({files.name});
files = files(order);

scripts = cell(numel(files), 1);
tmpDir = fullfile(tempdir, sprintf('omrunner_%d', floor(now * 1000)));
if ~exist(tmpDir, 'dir')
    mkdir(tmpDir);
end
cleanup = onCleanup(@() rmdirSafe(tmpDir));

for fi = 1:numel(files)
    path = fullfile(files(fi).folder, files(fi).name);
    [blockNames, blockCodes] = splitSuite(path);

    blocks = cell(numel(blockCodes), 1);
    for b = 1:numel(blockCodes)
        blocks{b} = runBlock(blockNames{b}, blockCodes{b}, tmpDir, fi, b);
    end

    entry = struct();
    entry.script = files(fi).name;
    if isempty(blocks)
        entry.blocks = struct([]);
    else
        entry.blocks = vertcat(blocks{:});
    end
    scripts{fi} = entry;
end

report = struct();
if isempty(scripts)
    report.scripts = struct([]);
else
    report.scripts = vertcat(scripts{:});
end

json = jsonencode(report);
fid = fopen(outFile, 'w');
fprintf(fid, '%s', json);
fclose(fid);
fprintf('[matlabRunner] wrote %s (%d scripts)\n', outFile, numel(report.scripts));
clear cleanup
end

% ------------------------------------------------------------------------
function rmdirSafe(d)
if exist(d, 'dir')
    rmdir(d, 's');
end
end

% ------------------------------------------------------------------------
function [blockNames, blockCodes] = splitSuite(path)
txt = fileread(path);
lines = splitlines(string(txt));

blockNames = {};
blockCodes = {};
curName = '';
cur = {};

for i = 1:numel(lines)
    l = lines(i);
    m = regexp(l, '^\s*%%\s*(.*)$', 'tokens', 'once');
    if ~isempty(m)
        if ~isempty(curName)
            blockCodes{end + 1} = strjoin(cur, sprintf("\n")); %#ok<AGROW>
        end
        cur = {};
        curName = strtrim(m{1});
        if isempty(curName)
            curName = sprintf('block_%d', numel(blockNames) + 1);
        end
        blockNames{end + 1} = curName;
    else
        if ~isempty(curName)
            cur{end + 1} = char(l); %#ok<AGROW>
        end
    end
end
if ~isempty(curName)
    blockCodes{end + 1} = strjoin(cur, sprintf("\n"));
end
end

% ------------------------------------------------------------------------
function blk = runBlock(name, code, tmpDir, scriptIdx, blockIdx)
blk = struct();
blk.name = name;
blk.ok = false;
blk.outputs = {};
blk.errors = {};
blk.workspace = struct();

[statements, functions] = splitFunctions(code);

tmpFile = fullfile(tmpDir, sprintf('s%d_b%d.m', scriptIdx, blockIdx));
fid = fopen(tmpFile, 'w');
fprintf(fid, '%s\n', statements);
if isempty(strtrim(functions))
    fprintf(fid, 'if false\nend\n');
end
fprintf(fid, '%s\n', functions);
fclose(fid);

% NOTE: the local names below are deliberately prefixed with `omHarness` so that
% a user program using a common name (`err`, `e`, `out`, ...) cannot shadow
% them. MATLAB executes the generated script in this function's workspace, so
% an unprefixed local would be clobbered by the script's own variables.
omHarnessErr = '';
omHarnessOut = '';
omHarnessOk = false;
omHarnessVarNames = {};
omHarnessVarVals = {};
try
    omHarnessRes = runIsolated(tmpFile);
    omHarnessOk = omHarnessRes.ok;
    omHarnessOut = omHarnessRes.out;
    omHarnessErr = omHarnessRes.err;
    omHarnessVarNames = omHarnessRes.varNames;
    omHarnessVarVals = omHarnessRes.varVals;
catch omHarnessCatch
    omHarnessErr = omHarnessCatch.message;
    omHarnessOk = false;
end

blk.ok = omHarnessOk;
blk.outputs = splitOutput(omHarnessOut);
blk.errors = {omHarnessErr};

% Serialize only the variables the block itself produced.
vars = struct();
for n = 1:numel(omHarnessVarNames)
    varName = omHarnessVarNames{n};
    if isRunnerVar(varName)
        continue;
    end
    vars.(matlabFieldName(varName)) = serializeVal(omHarnessVarVals{n});
end
blk.workspace = vars;
end

% ------------------------------------------------------------------------
function res = runIsolated(tmpFile)
% Run the generated script in the base workspace so every block gets a fresh
% workspace. This mirrors the OpenMat runner, which starts a new Interpreter
% per block, and stops one block's leftovers from polluting the comparison.
%
% The base workspace is used because many replication scripts start with
% `clear;`, which would otherwise wipe this function's own locals. The
% harness's state lives in this function's workspace and is therefore safe.
%
% The result is returned as a struct rather than as multiple output
% arguments: a script-level `catch err` would overwrite an output argument
% named `err` and corrupt the report. All locals are prefixed with
% `omHarness` for the same reason.
res = struct('ok', false, 'out', '', 'err', '', 'varNames', {{}}, 'varVals', {{}});

% Start from an empty base workspace.
evalin('base', 'clear;');

% The script is run in the base workspace so that a `clear;` at the top of
% the script does not wipe this function's locals. The path is handed over
% with `assignin`, because `evalin` can only evaluate expressions in the
% base workspace and therefore cannot see this function's local variables.
assignin('base', 'omHarnessScript', tmpFile);
try
    res.out = evalc('evalin(''base'', ''run(omHarnessScript);'');');
    res.ok = true;
catch omHarnessCatch
    res.err = omHarnessCatch.message;
end

% Report the variables the block created in the base workspace.
omHarnessPost = evalin('base', 'who');
for omHarnessK = 1:numel(omHarnessPost)
    omHarnessNm = omHarnessPost{omHarnessK};
    if isRunnerVar(omHarnessNm)
        continue;
    end
    try
        omHarnessVal = evalin('base', omHarnessNm);
    catch
        omHarnessVal = [];
    end
    res.varNames{end + 1} = omHarnessNm; %#ok<AGROW>
    res.varVals{end + 1} = omHarnessVal; %#ok<AGROW>
end

% Leave the base workspace clean for the next block.
evalin('base', 'clear;');
end

% ------------------------------------------------------------------------
function tf = isRunnerVar(n)
% Variables introduced by the harness itself, not by the user program.
% Note: 'ans' is a real MATLAB program variable and is intentionally kept.
% 'e' is also kept: MATLAB leaves a `catch e` binding in the workspace after
% the try/catch block, so filtering it would hide a real program variable.
switch n
    case {'tmpFile', 'omHarnessErr', 'omHarnessOut', 'omHarnessOk', ...
          'omHarnessVarNames', 'omHarnessVarVals', 'omHarnessRes', ...
          'omHarnessCatch', 'omHarnessPre', 'omHarnessPost', ...
          'omHarnessK', 'omHarnessNm', 'omHarnessVal', ...
          'omHarnessScript', ...
          'blk', 'code', 'tmpDir', 'scriptIdx', 'blockIdx', ...
          'statements', 'functions', 'fid', 'path', 'vars'}
        tf = true;
    otherwise
        tf = false;
end
end

% ------------------------------------------------------------------------
function [statements, functions] = splitFunctions(code)
% Separate top-level `function ... end` definitions from the executable
% statements, so the generated script obeys MATLAB's rule that local
% functions must appear at the end of the file.
lines = splitlines(string(code));

statements = {};
functions = {};
i = 1;
n = numel(lines);

while i <= n
    l = lines(i);
    if ~isempty(regexpi(l, '^\s*function\b', 'once'))
        fnLines = {};
        depth = 0;
        started = false;
        while i <= n
            fnLines{end + 1} = char(lines(i)); %#ok<AGROW>
            t = strtrim(lines(i));
            if ~isempty(regexpi(t, '^function\b', 'once'))
                started = true;
            end
            if started && strcmp(t, 'end')
                depth = depth + 1;
                if depth == 1
                    break;
                end
            end
            i = i + 1;
        end
        functions = [functions, fnLines]; %#ok<AGROW>
    else
        statements{end + 1} = char(l); %#ok<AGROW>
    end
    i = i + 1;
end

statements = strjoin(statements, sprintf("\n"));
functions = strjoin(functions, sprintf("\n"));
end

% ------------------------------------------------------------------------
function f = matlabFieldName(n)
f = regexprep(n, '[^A-Za-z0-9_]', '_');
if isempty(f) || ~isletter(f(1))
    f = ['v' f];
end
end

% ------------------------------------------------------------------------
function lines = splitOutput(txt)
txt = char(txt);
if isempty(strtrim(txt))
    lines = {};
    return;
end
raw = splitlines(string(txt));
lines = {};
for i = 1:numel(raw)
    if ~isempty(strtrim(raw(i)))
        lines{end + 1} = char(raw(i)); %#ok<AGROW>
    end
end
if isempty(lines)
    lines = {strtrim(txt)};
end
end

% The maximum number of elements serialized per matrix (see serializeVal).
function n = maxSerializedElements()
n = 4096;
end

% ------------------------------------------------------------------------
function t = matrixText(val)
% A compact textual rendering of a matrix.
%
% mat2str on an array with millions of elements produces a multi-gigabyte
% string, so large arrays are summarized by their shape instead.
if numel(val) <= 1024
    t = mat2str(val, 8);
else
    t = sprintf('%dx%d matrix', size(val, 1), size(val, 2));
end
end

% ------------------------------------------------------------------------
function els = cellElements(val)
% The contents of a cell array, flattened column-major.
%
% Numeric cells become plain number arrays, char cells become their
% characters, and anything else is described by its class name. The
% OpenMat side produces the same shapes, so the comparator can check
% the contents and not just the class.
els = cell(numel(val), 1);
for k = 1:numel(val)
    e = val{k};
    if isnumeric(e) || islogical(e)
        els{k} = reshape(double(e), 1, []);
    elseif ischar(e)
        els{k} = e;
    else
        els{k} = class(e);
    end
end
end

% ------------------------------------------------------------------------
function s = serializeVal(val)
% MATLAB struct field names must start with a letter, so the shared schema uses
% a 'kind' discriminator instead of a '__matrix'-style key.
% Data is stored row-major to match OpenMat's Matrix.toFlatArray().
s = struct();
if isnumeric(val) && isscalar(val)
    s.kind = 'matrix';
    s.rows = 1;
    s.cols = 1;
    s.data = [double(val)];
    s.text = num2str(double(val));
elseif isnumeric(val) && isempty(val)
    s.kind = 'matrix';
    % Keep the TRUE shape: MATLAB distinguishes 0x0 from 0x1 (`unique([])`
    % is 0x1), and the comparator checks the shape.
    s.rows = size(val, 1);
    s.cols = size(val, 2);
    s.data = [];
    s.text = '[]';
elseif isnumeric(val)
    s.kind = 'matrix';
    s.rows = size(val, 1);
    s.cols = size(val, 2);
    % Row-major flatten to match OpenMat's Matrix.toFlatArray().
    flat = reshape(val.', 1, []);
    % Only the leading elements are serialized: some replication blocks build
    % arrays with millions of elements, and a full report would be enormous.
    omMaxElems = maxSerializedElements();
    if numel(flat) > omMaxElems
        s.data = flat(1:omMaxElems);
        s.truncated = true;
    else
        s.data = flat;
        s.truncated = false;
    end
    s.text = matrixText(val);
elseif ischar(val)
    s.kind = 'string';
    s.value = val;
elseif iscell(val)
    % A cell array. The OpenMat side reports the class name `cell` and
    % the element list, so both engines must agree on both.
    s.kind = 'other';
    s.value = 'cell';
    s.elements = cellElements(val);
elseif islogical(val)
    s.kind = 'other';
    s.value = 'logical';
    s.data = reshape(val.', 1, []);
elseif isa(val, 'MException')
    % A caught error bound by `catch err`. MATLAB keeps the MException in
    % the workspace after the try/catch block, so it is a real program
    % variable; both engines report it as the same class.
    s.kind = 'other';
    s.value = 'MException';
else
    s.kind = 'other';
    s.value = class(val);
end
end
