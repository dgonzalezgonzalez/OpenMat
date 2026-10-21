%% AN-01: a basic anonymous function
f = @(x) x + 1;
a = f(2);
disp(a);
b = f([1 2 3]);
disp(b);

%% AN-02: several parameters
g = @(x, y) x .* y;
a = g(3, 4);
disp(a);

%% AN-03: a named function handle
h = @sin;
a = h(0);
disp(a);
b = class(h);
disp(b);

%% AN-04: an element-wise body
k = @(x) x.^2;
a = k([1 2 3]);
disp(a);

%% AN-05: no parameters
m = @() 42;
a = m();
disp(a);

%% AN-06: the captured workspace
base = 10;
n = @(x) x + base;
a = n(1);
disp(a);

%% AN-07: class and feval
p = @(x) x * 2;
a = class(p);
disp(a);
b = feval(p, 7);
disp(b);
c = feval('sin', 0);
disp(c);

%% AN-08: the handle is a value, not a number
q = @(x) x + 1;
a = q(2) + q(3);
disp(a);
