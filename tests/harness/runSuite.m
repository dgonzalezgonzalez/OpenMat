function runSuite(suiteDir, outFile)
% RUNSUITE Thin wrapper so the suite can be executed with:
%   matlab -batch "addpath('tests/harness'); runSuite('tests/matlab-suite','/tmp/ref.json')"
matlabRunner(suiteDir, outFile);
end
