%% FN-01: arrayfun applies a handle to every element
a = arrayfun(@(x) x.^2, [1 2 3]);
disp(a);
b = arrayfun(@(x) x + 1, [1 2; 3 4]);
disp(b);

%% FN-02: structfun applies a handle to every field
s = struct('a', 1, 'b', 2);
a = structfun(@(x) x * 2, s);
disp(a);
b = class(a);
disp(b);

%% FN-03: conv is the full convolution
a = conv([1 2], [1 2]);
disp(a);
b = conv([1 2 3], [1 1]);
disp(b);

%% FN-04: deconv divides and reports the remainder
[q, r] = deconv([1 2], [1 1]);
disp(q);
disp(r);
[q2, r2] = deconv([1 2 3], [1 1]);
disp(q2);
disp(r2);

%% FN-05: filter applies a causal linear filter
a = filter([1], [1], [1 2 3]);
disp(a);
b = filter([1 2], [1 -1], [1 2 3]);
disp(b);

%% FN-06: radix conversion
a = dec2bin(5);
disp(a);
b = dec2bin(5, 8);
disp(b);
c = bin2dec('101');
disp(c);
d = hex2dec('FF');
disp(d);
e = dec2hex(255);
disp(e);
f = dec2hex(255, 8);
disp(f);

%% FN-07: fzero finds a root in a bracket
a = fzero(@(x) x.^2 - 1, [0 2]);
disp(a);
b = fzero(@(x) x^2 - 1, 1);
disp(b);

%% FN-08: interp2 interpolates on a regular grid
a = interp2([1 2], [3 4], [1 2; 3 4], 1.5, 3.5);
disp(a);
b = interp2([1 2], [3 4], [1 2; 3 4], 1.5, 3.5, 'linear');
disp(b);
c = interp2([1 2], [3 4], [1 2; 3 4], 1.5, 3.5, 'nearest');
disp(c);
