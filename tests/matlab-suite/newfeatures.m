%% NEW-01: horzcat, vertcat and cat
a = [1 2];
b = [3 4];
disp(horzcat(a, b));
disp(vertcat(a, b));
disp(cat(1, a, b));
disp(cat(2, a, b));
c = [5; 6];
disp(horzcat(c, c));
disp(cat(2, c, c));

%% NEW-02: struct fields
s.x = 3;
s.y = 4;
s.z = s.x + s.y;
disp(s.x);
disp(s.z);
s.name = 'demo';
disp(s.name);
t.x = 1;
t.inner.y = 2;
disp(t.inner.y);

%% NEW-03: `end` in index expressions
A = [1 2 3; 4 5 6];
disp(A(end, 1));
disp(A(1, end));
disp(A(end-1, :));
disp(A(:, end));
disp(size(A, 1));
disp(size(A, 2));

%% NEW-04: indexed assignment grows the target
B = [1 2; 3 4];
B(3, 3) = 9;
disp(B);
C = zeros(1, 2);
C(4) = 7;
disp(C);

%% NEW-05: find with one and two outputs
disp(find([1 0 2; 0 3 0]));
[r, c] = find([1 0 2; 0 3 0]);
disp(r);
disp(c);

%% NEW-06: triu and tril
M = [1 2 3; 4 5 6; 7 8 9];
disp(triu(M));
disp(triu(M, 1));
disp(tril(M));
disp(tril(M, -1));

%% NEW-07: line continuation
x = 1 + ...
    2 + ...
    3;
disp(x);
y = [1 2 3] + ...
    [4 5 6];
disp(y);

%% NEW-08: num2str formatting
disp(num2str(pi));
disp(num2str(1234.5678));
disp(num2str(1e5));
disp(num2str(0.000012345));
disp(num2str([1 2.5 3]));
disp(num2str(42));
disp(num2str(-7));

%% NEW-09: rand and randn shapes and reproducibility
rng(1234);
u = rand(2, 3);
disp(size(u));
v = randn(2, 3);
disp(size(v));
disp(all(u(:) >= 0));
disp(all(u(:) < 1));
rng(1234);
u2 = rand(2, 3);
disp(u2 == u);
disp(v);

%% NEW-10: colon operator exactness
disp(0.1:0.1:0.5);
disp(length(0.01:0.01:1));
disp(1:0.25:2);
disp(10:-2:2);
