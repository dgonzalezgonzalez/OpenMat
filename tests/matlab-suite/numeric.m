%% NUM-01: classic 3x3 linear algebra workflow
A = [4 1 2; 1 5 3; 2 3 6];
detA = det(A);
invA = inv(A);
I = A * inv(A);
disp(detA);
disp(invA);
disp(I);
disp(trace(A));

%% NUM-02: solving a linear system Ax = b via the inverse
A = [2 1; 1 3];
b = [5; 6];
x = inv(A) * b;
disp(x);
disp(A * x);

%% NUM-03: LU-style Gaussian elimination by hand
A = [2 1 1; 1 3 2; 1 0 0];
disp(A);
disp(det(A));
disp(rank_placeholder);

%% NUM-04: matrix norms and traces
A = [3 4; 0 0];
disp(norm(A));
disp(trace(A));
disp(sum(diag(A)));

%% NUM-05: statistics over a data vector
data = [4 8 15 16 23 42];
disp(sum(data));
disp(mean(data));
disp(min(data));
disp(max(data));
disp(length(data));

%% NUM-06: linspace waveform
t = linspace(0, 4 * pi, 20);
disp(t);
y = sin(t);
disp(y);

%% NUM-07: damped cosine
t = linspace(0, 2 * pi, 10);
y = cos(t) .* exp(-0.1 * t);
disp(y);

%% NUM-08: element-wise powers and roots
v = [1 4 9 16];
disp(sqrt(v));
disp(v .^ 0.5);
disp(v .^ 2);

%% NUM-09: trigonometry sweep
a = [0 30 60 90];
r = a * pi / 180;
disp(sin(r));
disp(cos(r));
disp(tan(r));

%% NUM-10: matrix powers through repeated multiplication
A = [1 1; 0 1];
B = A * A;
disp(B);
C = B * A;
disp(C);

%% NUM-11: vector dot product via transpose
u = [1 2 3];
v = [4 5 6];
disp(u * v');
disp(sum(u .* v));

%% NUM-12: outer product
u = [1 2];
v = [3 4 5];
disp(u' * v);

%% NUM-13: cumulative style computation with a loop
acc = 0;
vals = [1 2 3 4 5];
for i = 1:length(vals)
    acc = acc + vals(i);
    disp(acc);
end

%% NUM-14: Newton-Raphson square root
x = 1;
for i = 1:6
    x = 0.5 * (x + 9 / x);
end
disp(x);

%% NUM-15: factorial by loop
f = 1;
n = 6;
for i = 1:n
    f = f * i;
end
disp(f);

%% NUM-16: Fibonacci
a = 0;
b = 1;
for i = 1:10
    disp(a);
    t = a + b;
    a = b;
    b = t;
end

%% NUM-17: a small matrix manipulation routine
function B = rotate2d(A, ang)
    c = cos(ang);
    s = sin(ang);
    R = [c -s; s c];
    B = R * A;
end
P = [1 0; 0 1];
disp(rotate2d(P, pi / 2));

%% NUM-18: helper returning a matrix
function M = grid2d(n)
    M = zeros(n, n);
    for i = 1:n
        for j = 1:n
            M(i, j) = i + j;
        end
    end
end
disp(grid2d(3));

%% NUM-19: matrix construction with a nested loop
M = zeros(3, 3);
for i = 1:3
    for j = 1:3
        M(i, j) = i * j;
    end
end
disp(M);

%% NUM-20: identity check via A * inv(A)
% A deterministic, non-trivial matrix is used instead of `rand`, because the
% two engines have different pseudo-random number generators.
for n = 1:4
    A = zeros(n, n);
    for i = 1:n
        A(i, i) = i + 1;
        A(i, mod(i, n) + 1) = A(i, mod(i, n) + 1) + 0.5;
    end
    A = A + n * eye(n);
    I = A * inv(A);
    disp(max(max(abs(I - eye(n)))));
end

%% NUM-21: row and column extraction
A = [1 2 3; 4 5 6; 7 8 9];
disp(A(1, :));
disp(A(:, 3));
disp(A(2, 2));

%% NUM-22: reading a slice and summing it
A = [1 2 3; 4 5 6; 7 8 9];
disp(sum(A(1, :)));
disp(sum(A(:, 1)));
disp(sum(A(:)));

%% NUM-23: conditional branching on a computed value
x = 16;
if x < 0
    disp('negative');
elseif x == 0
    disp('zero');
else
    disp('positive');
end
y = x ^ 0.5;
disp(y);

%% NUM-24: logical reduction over a comparison
A = [1 2 3; 4 5 6];
disp(sum(A > 3));
disp(all(A > 0));
disp(any(A > 5));

%% NUM-25: building a report string
name = 'OpenMat';
n = 3;
msg = ['Value of ' name ' is ' num2str(n)];
disp(msg);

%% NUM-26: multi-step matrix pipeline
A = [1 2; 3 4];
B = A';
C = A * B;
D = C + eye(2);
E = D * inv(D);
disp(C);
disp(D);
disp(E);

%% NUM-27: handling a scalar workspace variable
x = 42;
disp(x);
disp(x * 2);
disp(x ^ 2);

%% NUM-28: strings stored in the workspace
s = 'alpha';
disp(s);
t = 'beta';
disp(t);

%% NUM-29: element-wise ops between a matrix and a vector
A = [1 2 3; 4 5 6];
v = [10 20 30];
disp(A + v);
disp(A .* v);

%% NUM-30: sum of a single row
A = [1 2 3];
disp(sum(A));
disp(sum(A, 2));

%% NUM-31: mean of a column
A = [1 2 3; 4 5 6];
disp(mean(A, 1));
disp(mean(A, 2));

%% NUM-32: reshaping a flat sequence
v = 1:12;
M = reshape(v, 3, 4);
disp(M);
disp(size(M));
disp(sum(M(:)));

%% NUM-33: diagonal of a matrix
A = [1 2 3; 4 5 6; 7 8 10];
disp(diag(A));
disp(sum(diag(A)));

%% NUM-34: identity and zeros with mismatched shapes
disp(eye(2, 3));
disp(zeros(1, 4));
disp(ones(4, 1));

%% NUM-35: large-ish deterministic matrix
A = zeros(5, 5);
for i = 1:5
    A(i, i) = i;
    A(i, 6 - i) = 2 * i;
end
disp(A);
disp(det(A));
disp(trace(A));
disp(norm(A));
