function x = logninv(p, mu, sigma)
% LOGNINV Inverse of the log-normal cumulative distribution function.
%
% A base-MATLAB implementation of the Statistics Toolbox function, used so
% that replication packages can run without the toolbox installed.
%
%   x = logninv(p, mu, sigma) returns the log-normal quantile for the
%   probability p.
if nargin < 2
    mu = 0;
end
if nargin < 3
    sigma = 1;
end
x = exp(mu + sigma * norminv(p));
end
