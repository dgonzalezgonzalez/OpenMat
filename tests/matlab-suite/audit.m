%% AUD-01: abs, sign, fix, round, floor, ceiling
a = abs([-3 3 -3.7 3.7]);
disp(a);
b = sign([-3 0 3 -3.7]);
disp(b);
c = fix([-3.7 3.7 -3 3]);
disp(c);
d = round([-3.5 3.5 2.5 -2.5 1.4]);
disp(d);
e = floor([-3.7 3.7]);
disp(e);
f = ceil([-3.7 3.7]);
disp(f);

%% AUD-02: min, max, mean, median
a = min([3 1 4 1 5]);
disp(a);
b = max([3 1 4 1 5]);
disp(b);
c = mean([1 2 3 4]);
disp(c);
d = median([1 5 3 2 4]);
disp(d);
e = min([3 1 4; 2 8 6]);
disp(e);
f = max([3 1 4; 2 8 6]);
disp(f);
g = mean([1 2; 3 4]);
disp(g);

%% AUD-03: sum, prod, cumsum, cumprod
a = sum([1 2 3 4]);
disp(a);
b = prod([1 2 3 4]);
disp(b);
c = cumsum([1 2 3 4]);
disp(c);
d = cumprod([1 2 3 4]);
disp(d);
e = sum([1 2; 3 4]);
disp(e);
f = sum([1 2; 3 4], 2);
disp(f);
g = prod([1 2; 3 4], 2);
disp(g);
h = cumsum([1 2; 3 4], 2);
disp(h);

%% AUD-04: mod, rem, and integer division
a = mod(7, 3);
disp(a);
b = rem(7, 3);
disp(b);
c = mod(-7, 3);
disp(c);
d = rem(-7, 3);
disp(d);
e = mod(7.5, 2);
disp(e);
f = rem(7.5, 2);
disp(f);
g = mod(6, 3);
disp(g);

%% AUD-05: factorial, nchoosek, gamma
a = factorial(5);
disp(a);
b = nchoosek(5, 2);
disp(b);
c = gamma(5);
disp(c);
d = factorial(0);
disp(d);
e = nchoosek(10, 0);
disp(e);

%% AUD-06: trigonometric and hyperbolic
a = sin(0);
disp(a);
b = cos(0);
disp(b);
c = tan(0);
disp(c);
d = asin(1);
disp(d);
e = acos(1);
disp(e);
f = atan(1);
disp(f);
g = atan2(1, 1);
disp(g);
h = sinh(1);
disp(h);
i = cosh(1);
disp(i);
j = tanh(1);
disp(j);

%% AUD-07: exponentials and logarithms
a = exp(1);
disp(a);
b = log(2);
disp(b);
c = log10(100);
disp(c);
d = log2(8);
disp(d);
e = exp(0);
disp(e);

%% AUD-08: powers and roots
a = 2 ^ 10;
disp(a);
b = 2 ^ 0.5;
disp(b);
c = 8 ^ (1/3);
disp(c);
d = nthroot(27, 3);
disp(d);
% NOTE: `(-8) ^ (1/3)` is deliberately excluded. MATLAB returns a COMPLEX
% value there (1.0000 + 1.7321i); OpenMat has no complex arithmetic and
% returns NaN. The parity harness cannot compare complex values at all --
% MATLAB's `jsonencode` refuses them -- so this case cannot live in the
% suite. See AGENTS.md, "Complex numbers are not implemented".
f = 2 .^ [1 2 3];
disp(f);
g = [1 2 3] .^ 2;
disp(g);

%% AUD-09: matrix shapes and manipulation
A = [1 2 3; 4 5 6];
a = size(A);
disp(a);
b = numel(A);
disp(b);
c = length(A);
disp(c);
d = reshape(A, 3, 2);
disp(d);
e = A';
disp(e);
f = A(:);
disp(f);
g = repmat(A, 2, 1);
disp(g);
h = diag([1 2 3]);
disp(h);
i = eye(3);
disp(i);
j = zeros(2, 3);
disp(j);
k = ones(1, 3);
disp(k);

%% AUD-10: indexing and assignment
A = [1 2 3; 4 5 6];
a = A(2, 3);
disp(a);
b = A(1, :);
disp(b);
c = A(:, 2);
disp(c);
d = A(2:end, 1);
disp(d);
e = A([1 3], :);
disp(e);
A(1, 1) = 99;
disp(A);
B = A;
B(2, :) = 0;
disp(B);

%% AUD-11: logical operations
a = [1 0 1] & [1 1 0];
disp(a);
b = [1 0 1] | [1 1 0];
disp(b);
c = ~[1 0 1];
disp(c);
d = [1 0 1] == [1 1 0];
disp(d);
e = [1 2 3] > 2;
disp(e);
f = any([1 0 1]);
disp(f);
g = all([1 1 1]);
disp(g);
h = any([0 0 0]);
disp(h);
i = all([1 0 1]);
disp(i);

%% AUD-12: element-wise and matrix arithmetic
A = [1 2; 3 4];
B = [5 6; 7 8];
a = A + B;
disp(a);
b = A - B;
disp(b);
c = A .* B;
disp(c);
d = A ./ B;
disp(d);
e = A * B;
disp(e);
f = A / B;
disp(f);
g = A \ B;
disp(g);
h = A .^ 2;
disp(h);
i = -A;
disp(i);
j = A.';
disp(j);

%% AUD-13: determinant, inverse, trace, rank
A = [1 2; 3 4];
a = det(A);
disp(a);
b = inv(A);
disp(b);
c = trace(A);
disp(c);
d = rank([1 2; 3 4]);
disp(d);
e = det(eye(3));
disp(e);

%% AUD-14: norm, dot, cross, kron
a = norm([3 4]);
disp(a);
b = norm([3 4], 1);
disp(b);
c = norm([3 4], Inf);
disp(c);
d = dot([1 2], [3 4]);
disp(d);
e = cross([1 0 0], [0 1 0]);
disp(e);
f = kron([1 2], [3 4]);
disp(f);

%% AUD-15: sort and find
a = sort([3 1 2]);
disp(a);
b = sort([3 1 2], 'descend');
disp(b);
c = find([1 0 2 0 3]);
disp(c);
d = find([1 0 2 0 3], 2);
disp(d);
[e, f] = find([1 0 2; 0 3 0]);
disp(e);
disp(f);
g = sortrows([2 1; 1 2]);
disp(g);

%% AUD-16: complex-free numeric helpers
a = hypot(3, 4);
disp(a);
b = gcd(12, 18);
disp(b);
c = lcm(4, 6);
disp(c);
d = rem(floor(7/2), 2);
disp(d);

%% AUD-17: string builtins
a = upper('hello');
disp(a);
b = lower('HELLO');
disp(b);
c = strcat('ab', 'cd');
disp(c);
d = strrep('aXbXc', 'X', '-');
disp(d);
e = strtrim('  pad  ');
disp(e);
f = sprintf('%d-%s', 5, 'x');
disp(f);
g = num2str(1234.5678);
disp(g);
h = num2str(pi);
disp(h);

%% AUD-18: cell-free struct behaviour
s.a = 1;
s.b = 'two';
disp(s.a);
disp(s.b);
disp(fieldnames(s));
t = struct('x', 1);
disp(t.x);

%% AUD-19: linear algebra on larger matrices
rng(42);
A = rand(3, 3);
a = det(A);
disp(a);
b = A * A;
disp(b);
c = A \ ones(3, 1);
disp(c);
d = A';
disp(d);
e = trace(A);
disp(e);
f = norm(A, 'fro');
disp(f);

%% AUD-20: eigen and singular values
A = [2 0; 0 3];
a = sort(eig(A));
disp(a);
b = svd([3 0; 0 4]);
disp(b);
c = chol([4 1; 1 3]);
disp(c);
