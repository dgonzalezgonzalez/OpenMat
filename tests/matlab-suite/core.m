%% MAT-01: matrix literals, arithmetic, transpose
A = [1 2; 3 4];
disp(A);
disp(A + A);
disp(A * A');
disp(A .* A);
disp(A ./ A);
disp(A .^ 2);
disp(-A);

%% MAT-02: determinants, inverse, trace, norm
A = [4 1 2; 1 5 3; 2 3 6];
disp(det(A));
disp(inv(A));
disp(A * inv(A));
disp(trace(A));
disp(norm([3 4; 0 0]));

%% MAT-03: constructors
disp(zeros(2, 3));
disp(ones(3));
disp(eye(3));
disp(linspace(0, 1, 5));
disp(logspace(0, 2, 3));
% `rand`/`randn` are not compared across engines (the PRNGs differ), so
% only the deterministic shape of their output is checked.
disp(size(rand(2, 2)));
disp(size(randn(2, 2)));
disp(all(rand(2, 2) >= 0));
disp(all(randn(2, 2) >= 0));

%% MAT-04: diag, reshape, size, length, numel
disp(diag([1 2 3]));
disp(diag([1 2; 3 4]));
disp(reshape(1:6, 2, 3));
disp(size([1 2; 3 4]));
disp(size([1 2; 3 4], 2));
disp(length([1 2 3]));
disp(numel([1 2; 3 4]));
disp(isempty(zeros(0, 0)));

%% MAT-05: statistics
M = [1 2 3; 4 5 6];
disp(sum(M));
disp(sum(M, 2));
disp(mean(M));
disp(mean(M, 2));
disp(min(M));
disp(max(M));

%% MAT-06: element-wise math functions
x = [0 1 2 3];
disp(sin(x));
disp(cos(x));
disp(tan(x));
disp(exp(x));
disp(log(x + 1));
disp(log10(x + 1));
disp(sqrt(x));
disp(abs([-1 2 -3]));
disp(floor([1.7 -1.7]));
disp(ceil([1.2 -1.2]));
disp(round([1.5 2.4 -1.6]));
disp(asin([0 1]));
disp(acos([0 1]));
disp(atan([0 1]));

%% MAT-07: control flow - if / elseif / else
x = 5;
if x > 10
    disp('big');
elseif x > 3
    disp('medium');
else
    disp('small');
end

%% MAT-08: for loop over a range
s = 0;
for i = 1:5
    s = s + i;
end
disp(s);

%% MAT-09: for loop with a step
s = 0;
for i = 0:2:10
    s = s + i;
end
disp(s);

%% MAT-10: while loop
i = 0;
while i < 4
    disp(i);
    i = i + 1;
end

%% MAT-11: break
for i = 1:10
    if i > 3
        break;
    end
    disp(i);
end

%% MAT-12: continue
for i = 1:6
    if mod(i, 2) == 0
        continue;
    end
    disp(i);
end

%% MAT-13: user function with a single output
function y = squareplus(x)
    y = x * x + 1;
end
disp(squareplus(4));

%% MAT-14: user function that writes to the command window
function y = loud(x)
    y = x;
    disp('INSIDE-LOUD');
end
loud(7);

%% MAT-15: user function with two outputs
function [p, q] = twoval(a)
    p = a + 1;
    q = a + 2;
end
[p, q] = twoval(10);
disp(p);
disp(q);

%% MAT-16: recursive / nested calls
function y = outer(x)
    y = inner(x) + 1;
end
function y = inner(x)
    y = x * 10;
end
disp(outer(2));

%% MAT-17: function with early return
function y = earlyexit(x)
    y = 0;
    if x > 0
        y = 1;
        return;
    end
    y = 2;
end
disp(earlyexit(5));
disp(earlyexit(-5));

%% MAT-18: function branching on a condition
function y = signflip(x)
    if x > 0
        y = 1;
    else
        y = -1;
    end
end
disp(signflip(3));
disp(signflip(-3));

%% MAT-19: switch / case
x = 2;
switch x
    case 1
        disp('one');
    case 2
        disp('two');
    otherwise
        disp('many');
end

%% MAT-20: try / catch
try
    disp(no_such_variable_here);
catch err
    disp('CAUGHT-ERROR');
end

%% MAT-21: 1-based indexing
A = [10 20 30; 40 50 60];
disp(A(1, 1));
disp(A(2, 3));
disp(A(1, :));
disp(A(:, 2));
disp(A(:));
disp(A(end, 1));
disp(A(end - 1, 2));

%% MAT-22: linear indexing
A = [1 2 3; 4 5 6];
disp(A(4));
disp(A(1:3));

%% MAT-23: index assignment
A = [1 2 3; 4 5 6];
A(1, 2) = 99;
disp(A);
A(3) = 77;
disp(A);

%% MAT-24: comparison operators
disp([1 2 3] == [1 0 3]);
disp([1 2 3] ~= [1 0 3]);
disp([1 2 3] < 3);
disp([1 2 3] <= 2);
disp([1 2 3] > 2);
disp([1 2 3] >= 3);

%% MAT-25: scalar comparison against a matrix
C = [1 2 3; 4 5 6];
disp(C > 3);
disp(C == 4);
disp(C <= 2);

%% MAT-26: logical operators
disp([1 0 1] & [1 1 0]);
disp([1 0 1] | [0 0 1]);
disp(~[1 0 1]);
disp([1 1 1] && [1 0 1]);

%% MAT-27: colon ranges
r = 1:5;
disp(r);
r = 0:0.5:2;
disp(r);
r = 10:-2:2;
disp(r);

%% MAT-28: nested function definitions
function y = nestouter(x)
    y = nestinner(x) * 2;
end
function y = nestinner(x)
    y = x + 3;
end
disp(nestouter(1));

%% MAT-29: function that uses a helper constant
function y = withconst(x)
    K = 10;
    y = x * K;
end
disp(withconst(4));

%% MAT-30: string handling
s = 'hello';
disp(s);
disp('world');
disp(length(s));

%% MAT-31: matrix multiply error case
A = [1 2; 3 4];
B = [1 2 3; 4 5 6];
try
    disp(A * B);
catch e
    disp('DIMENSION-MISMATCH');
end

%% MAT-32: singular matrix inverse
S = [1 2; 2 4];
try
    disp(inv(S));
catch e
    disp('SINGULAR');
end

%% MAT-33: determinant of a non-square matrix
try
    disp(det([1 2 3; 4 5 6]));
catch e
    disp('NOT-SQUARE');
end

%% MAT-34: vector as a row and as a column
r = [1 2 3];
c = [1; 2; 3];
disp(r * c');
disp(c * r');

%% MAT-35: trace and norm of a vector
v = [3 4];
disp(trace(v));
disp(norm(v));
disp(norm(v, 1));

%% MAT-36: element-wise operations between two vectors
a = [1 2 3];
b = [4 5 6];
disp(a + b);
disp(a - b);
disp(a .* b);
disp(a ./ b);
disp(a .^ b);

%% MAT-37: scalar broadcasting
M = [1 2; 3 4];
disp(M * 2);
disp(M + 10);
disp(M - 1);
disp(M / 2);

%% MAT-38: empty and identity operations
disp(eye(3) * eye(3));
disp(zeros(2, 2) + 1);
disp(ones(2, 3) .* ones(2, 3));

%% MAT-39: max and min of a vector
disp(max([4 9 2]));
disp(min([4 9 2]));

%% MAT-40: multiple sequential statements and workspace growth
a = 1;
b = a + 1;
c = b + a;
d = c + b;
disp(d);
