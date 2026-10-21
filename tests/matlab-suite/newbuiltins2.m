%% NB-13: logical constants and conversion
a = true;
disp(a);
b = false;
disp(b);
c = true(2);
disp(c);
d = true(2, 3);
disp(d);
e = false(2);
disp(e);
f = logical([0 1 2 -3]);
disp(f);
g = logical(0);
disp(g);
h = double(true);
disp(h);
i = class(true);
disp(i);
j = class(logical([1 0]));
disp(j);
k = islogical(true);
disp(k);
l = islogical(1);
disp(l);

%% NB-14: shape predicates
a = isscalar(5);
disp(a);
b = isscalar([1 2]);
disp(b);
c = isrow([1 2]);
disp(c);
d = isrow([1; 2]);
disp(d);
e = iscolumn([1; 2]);
disp(e);
f = iscolumn([1 2]);
disp(f);
g = isvector([1 2]);
disp(g);
h = isvector([1; 2]);
disp(h);
i = isvector([1 2; 3 4]);
disp(i);
j = ismatrix([1 2; 3 4]);
disp(j);
k = ismatrix([1 2]);
disp(k);

%% NB-15: flip and rot90
a = flip([1 2; 3 4]);
disp(a);
b = flip([1 2; 3 4], 2);
disp(b);
c = flip([1 2 3]);
disp(c);
d = rot90([1 2; 3 4]);
disp(d);
e = rot90([1 2; 3 4], 2);
disp(e);

%% NB-16: meshgrid and ndgrid
[X, Y] = meshgrid(1:3, 1:2);
disp(X);
disp(Y);
[X2, Y2] = ndgrid(1:3, 1:2);
disp(X2);
disp(Y2);

%% NB-17: strfind
a = strfind('hello', 'll');
disp(a);
b = strfind('aXbXc', 'X');
disp(b);
c = strfind('hello', 'z');
disp(c);

%% NB-18: true and false in control flow
if true
    disp('is true');
else
    disp('is false');
end
if false
    disp('is true');
else
    disp('is false');
end
x = true && false;
disp(x);
y = ~true;
disp(y);
z = true || false;
disp(z);
