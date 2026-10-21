%% UF-01: comparison operators produce logical arrays
a = class([1 2] == [1 3]);
disp(a);
b = class([1 2] < [1 3]);
disp(b);
c = class([1 0] & [1 1]);
disp(c);
d = class(1 && 1);
disp(d);
e = islogical([1 2] >= [1 3]);
disp(e);

%% UF-02: the comparison operators' values
a = [1 2] == [1 3];
disp(a);
b = [1 2] ~= [1 3];
disp(b);
c = [1 2] < [1 3];
disp(c);
d = [1 2] <= [1 3];
disp(d);
e = [1 2] > [1 3];
disp(e);
f = [1 2] >= [1 3];
disp(f);

%% UF-03: the arithmetic ufuncs
a = plus([1 2], [3 4]);
disp(a);
b = minus([1 2], [3 4]);
disp(b);
c = times([1 2; 3 4], [1 0; 0 1]);
disp(c);
d = mtimes([1 2; 3 4], [1 0; 0 1]);
disp(d);
e = rdivide([1 2], [4 2]);
disp(e);
f = ldivide([4 2], [1 2]);
disp(f);
g = power([2 3], 2);
disp(g);
h = uminus([1 -2]);
disp(h);
i = uplus(3);
disp(i);

%% UF-04: the comparison functions
a = eq(1, 2);
disp(a);
b = ne(1, 2);
disp(b);
c = lt(1, 2);
disp(c);
d = le(1, 2);
disp(d);
e = gt(1, 2);
disp(e);
f = ge(1, 2);
disp(f);
g = class(eq(1, 2));
disp(g);

%% UF-05: the logical functions
a = and([1 0], [1 1]);
disp(a);
b = or([1 0], [0 1]);
disp(b);
c = xor([1 0], [0 1]);
disp(c);
d = not([0 1]);
disp(d);
e = class(not(0));
disp(e);

%% UF-06: bsxfun applies a handle element-wise
a = bsxfun(@plus, [1 2], [3 4]);
disp(a);
b = bsxfun(@plus, [1; 2; 3], [1 2 3]);
disp(b);
c = bsxfun(@minus, [1 2 3], [1 1 1]);
disp(c);
d = bsxfun(@max, [1 5], [3 2]);
disp(d);
e = bsxfun(@plus, [1 2], 1);
disp(e);
f = bsxfun(@(x, y) x .* y, [1 2], [3 4]);
disp(f);

%% UF-07: str2func makes a named handle
h = str2func('sin');
a = class(h);
disp(a);
b = h(0);
disp(b);

%% UF-08: element-wise left division follows MATLAB's zero rule
a = 0 .\ 0;
disp(a);
b = 0 .\ 5;
disp(b);
c = ldivide(0, 5);
disp(c);
