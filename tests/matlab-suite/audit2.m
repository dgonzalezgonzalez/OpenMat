%% AUD2-01: prod, cumsum, cumprod with and without a dimension
a = prod([1 2; 3 4]);
disp(a);
b = prod([1 2; 3 4], 1);
disp(b);
c = prod([1 2; 3 4], 2);
disp(c);
d = cumsum([1 2; 3 4]);
disp(d);
e = cumsum([1 2; 3 4], 1);
disp(e);
f = cumsum([1 2; 3 4], 2);
disp(f);
g = cumprod([1 2; 3 4]);
disp(g);
h = cumprod([1 2; 3 4], 2);
disp(h);
i = cumprod([1 2; 3 4], 1);
disp(i);
j = prod([1 2 3]);
disp(j);
k = cumsum([1 2 3]);
disp(k);

%% AUD2-02: sort orientation and dimensions
a = sort([3 1 2]);
disp(a);
b = sort([3; 1; 2]);
disp(b);
c = sort([3 1 2; 1 4 2]);
disp(c);
d = sort([3 1 2], 'descend');
disp(d);
e = sort([3 1 2; 1 4 2], 2);
disp(e);
f = sort([3 1 2], 'ascend');
disp(f);

%% AUD2-03: unique orientation
a = unique([3 1 3 2 1 5]);
disp(a);
b = unique([3; 1; 3; 2; 1; 5]);
disp(b);
c = unique([1 2 3; 2 3 4]);
disp(c);
[d, e] = unique([3 1 3 2 1 5]);
disp(d);
disp(e);

%% AUD2-04: find orientation
a = find([1 0 2 0 3]);
disp(a);
b = find([1 0 2; 0 3 0]);
disp(b);
c = find([1 0 2 0 3], 2);
disp(c);
d = find([1; 0; 2]);
disp(d);
[e, f] = find([1 0 2; 0 3 0]);
disp(e);
disp(f);

%% AUD2-05: round, sign, fix
a = round([-3.5 3.5 2.5 -2.5 1.4 0.5 -0.5]);
disp(a);
b = round(2.5);
disp(b);
c = round(-2.5);
disp(c);
d = sign([-3 0 3 -3.7]);
disp(d);
e = fix([-3.7 3.7 -3 3]);
disp(e);

%% AUD2-06: hyperbolic and logarithmic functions
a = sinh(1);
disp(a);
b = cosh(1);
disp(b);
c = tanh(1);
disp(c);
d = asinh(1);
disp(d);
e = acosh(2);
disp(e);
f = atanh(0.5);
disp(f);
g = log2(8);
disp(g);
h = log2(0.5);
disp(h);
i = log1p(1e-10);
disp(i);
j = expm1(1e-10);
disp(j);

%% AUD2-07: gcd and lcm
a = gcd(12, 18);
disp(a);
b = lcm(4, 6);
disp(b);
c = gcd([12 8], [18 4]);
disp(c);
d = gcd(-12, 18);
disp(d);

%% AUD2-08: sortrows
a = sortrows([2 1; 1 2]);
disp(a);
b = sortrows([2 1; 1 2], 'descend');
disp(b);
c = sortrows([1 3; 1 2], 2);
disp(c);
d = sortrows([2 1; 1 2], 1);
disp(d);

%% AUD2-09: fieldnames and struct
s.b = 2;
s.a = 1;
s.c = 3;
disp(fieldnames(s));
t = struct('x', 1);
disp(t.x);
u = struct('x', 1, 'y', 'two');
disp(u.x);
disp(u.y);

%% AUD2-10: eig, svd and chol shapes
a = eig([2 0; 0 3]);
disp(a);
b = svd([3 0; 0 4]);
disp(b);
c = chol([4 1; 1 3]);
disp(c);
d = chol([4 1; 1 3])' * chol([4 1; 1 3]);
disp(d);

%% AUD2-11: norm variants
a = norm([3 4]);
disp(a);
b = norm([3 4], 1);
disp(b);
c = norm([3 4], Inf);
disp(c);
d = norm([1 2; 3 4], 'fro');
disp(d);
e = norm([1 2; 3 4], 1);
disp(e);
f = norm([1 2; 3 4], Inf);
disp(f);

%% AUD2-12: factorial and nchoosek at the boundaries
a = factorial(0);
disp(a);
b = factorial(1);
disp(b);
c = factorial(5);
disp(c);
d = nchoosek(10, 0);
disp(d);
e = nchoosek(0, 0);
disp(e);
f = nchoosek(5, 2);
disp(f);

%% AUD2-13: sprintf returns a char, fprintf prints
a = sprintf('%d-%s', 5, 'x');
disp(a);
b = class(sprintf('%d', 5));
disp(b);
fprintf('printed %d\n', 7);

%% AUD2-14: min, max and mean along dimensions
A = [1 2 3; 4 5 6];
a = min(A);
disp(a);
b = max(A);
disp(b);
c = mean(A);
disp(c);
d = min(A, [], 2);
disp(d);
e = max(A, [], 2);
disp(e);
f = mean(A, 2);
disp(f);

%% AUD2-15: reshape, repmat and indexing corner cases
A = reshape(1:6, 2, 3);
disp(A);
B = repmat([1 2], 2, 1);
disp(B);
C = A(:, [3 1]);
disp(C);
D = A(2, :);
disp(D);
E = A * A';
disp(E);
