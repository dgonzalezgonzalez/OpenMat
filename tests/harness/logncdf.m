function y = logncdf(x, mu, sigma)
% LOGNCDF Log-normal cumulative distribution function.
%
% A base-MATLAB implementation of the Statistics Toolbox function, used so
% that replication packages can run without the toolbox installed.
%
%   y = logncdf(x, mu, sigma) evaluates the log-normal CDF at x for a
%   log-normal distribution with mean of the underlying normal `mu` and
%   standard deviation `sigma`.
if nargin < 2
    mu = 0;
end
if nargin < 3
    sigma = 1;
end
% Mask before evaluating: `log(x)` of a non-positive x is complex, and
% `erfc` rejects complex input. MATLAB's own logncdf returns 0 there.
y = zeros(size(x));
pos = x > 0;
y(pos) = 0.5 * erfc(-(log(x(pos)) - mu) ./ (sigma * sqrt(2)));
end
