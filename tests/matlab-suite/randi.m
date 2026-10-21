%% RD-01: randi maps one uniform per element onto the requested range
rng(5489);
a = randi(10, 1, 12);
disp(a);
b = randi([1 10], 1, 12);
disp(b);

%% RD-02: randi honours an explicit lower bound
rng(5489);
a = randi([2 5], 1, 12);
disp(a);

%% RD-03: randi fills column-major and accepts a size vector
rng(5489);
a = randi(10, 2, 3);
disp(a);
b = randi(10, [2 3]);
disp(b);

%% RD-04: randperm is the argsort of n uniforms
rng(5489);
a = randperm(10);
disp(a);
b = randperm(6);
disp(b);

%% RD-05: randi and randperm draw from the same stream as rand
rng(5489);
a = randperm(10);
disp(a);
b = rand(1, 3);
disp(b);

%% RD-06: randperm(n,k) uses a different algorithm from randperm(n)
rng(5489);
a = randperm(10, 3);
disp(a);
b = randperm(10, 4);
disp(b);
c = randperm(10, 10);
disp(c);
