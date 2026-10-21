%% NB-01: numeric predicates
a = isnan([1 NaN Inf -Inf 0]);
disp(a);
b = isinf([1 NaN Inf -Inf 0]);
disp(b);
c = isfinite([1 NaN Inf -Inf 0]);
disp(c);
d = isnan(NaN);
disp(d);
e = isnan([1 NaN; NaN 2]);
disp(e);

%% NB-02: string comparison
a = strcmp('abc', 'abc');
disp(a);
b = strcmp('abc', 'abd');
disp(b);
c = strcmp('abc', 'abcd');
disp(c);
d = strcmp('', '');
disp(d);
e = strcmpi('ABC', 'abc');
disp(e);
f = strcmpi('ABC', 'abd');
disp(f);
g = strncmp('abcd', 'abce', 2);
disp(g);
h = strncmp('abcd', 'abce', 3);
disp(h);
i = strncmp('abcd', 'abce');
disp(i);
j = strncmpi('ABCD', 'abce', 3);
disp(j);

%% NB-03: unique
a = unique([3 1 3 2 1 5]);
disp(a);
[b, c] = unique([3 1 3 2 1 5]);
disp(b);
disp(c);
d = unique([]);
disp(d);
e = unique([7]);
disp(e);
f = unique([-1 0 -1 2]);
disp(f);
g = unique([1.0 1.5 1.0]);
disp(g);

%% NB-04: interp1 default method is spline
a = interp1([1 2 3], [10 20 30], 2.5);
disp(a);
b = interp1([1 2 3], [10 20 30], 2.5, 'linear');
disp(b);
c = interp1([1 2 3], [10 20 30], 1.5);
disp(c);
d = interp1([1 2 4], [10 20 40], 3);
disp(d);
e = interp1([0 1 3 7], [0 2 9 30], 2);
disp(e);

%% NB-05: interp1 method variants
a = interp1([1 2 3], [10 20 30], 2.5, 'nearest');
disp(a);
b = interp1([1 2 3], [10 20 30], 2.5, 'previous');
disp(b);
c = interp1([1 2 3], [10 20 30], 2.5, 'next');
disp(c);
d = interp1([1 2 3], [10 20 30], 2.5, 'spline');
disp(d);
e = interp1([1 2 3], [10 20 30], 2.5, 'pchip');
disp(e);
f = interp1([1 2 3], [10 20 30], 2.5, 'cubic');
disp(f);
g = interp1([1 2 3], [10 20 30], 2.5, 'makima');
disp(g);
h = interp1([1 2 4], [10 20 40], 3, 'nearest');
disp(h);

%% NB-06: interp1 out of range and vector query
a = interp1([1 2 3], [10 20 30], 5);
disp(a);
b = interp1([1 2 3], [10 20 30], 0);
disp(b);
c = interp1([1 2 3], [10 20 30], [1 1.5 3]);
disp(c);

%% NB-07: cumtrapz
a = cumtrapz([0 1 2 3]);
disp(a);
b = cumtrapz([0 1 2 3], [0 1 2 3]);
disp(b);
c = cumtrapz([0 1 2 3], [0 2 4 6]);
disp(c);
d = cumtrapz([1 1 1]);
disp(d);

%% NB-08: cov and corrcoef
x = [1 2 3 4];
y = [2 4 5 9];
a = cov(x, y);
disp(a);
b = corrcoef(x, y);
disp(b);

%% NB-09: eps and nan
a = eps;
disp(a);
b = eps(1);
disp(b);
c = isnan(nan);
disp(c);
d = size(nan(2, 3));
disp(d);

%% NB-10: class and isstruct
a = class(1);
disp(a);
b = class('hi');
disp(b);
c = class([1 2 3]);
disp(c);
d = isstruct(1);
disp(d);
s.x = 1;
e = class(s);
disp(e);
f = isstruct(s);
disp(f);

%% NB-11: nargin and nargout
function y = nbHelper(a, b)
y = nargin;
end
function [p, q] = nbHelper2(x)
p = nargout;
q = 0;
end
a = nbHelper(1);
disp(a);
b = nbHelper(1, 2);
disp(b);
[p, q] = nbHelper2(5);
disp(p);
disp(q);

%% NB-12: real and imag on real data
a = real(3);
disp(a);
b = imag(3);
disp(b);
c = conj(3);
disp(c);
