function z = norminv(p, mu, sigma)
% NORMINV Inverse of the normal cumulative distribution function.
%
% A base-MATLAB implementation of the Statistics Toolbox function, used so
% that replication packages can run without the toolbox installed.
%
% It uses Peter Acklam's rational approximation refined with one Halley
% step against the exact CDF, which brings the result to full double
% precision. The refinement matches the one OpenMat's engine performs, so
% the two engines agree digit for digit.
if nargin < 2
    mu = 0;
end
if nargin < 3
    sigma = 1;
end

a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, ...
     1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, ...
     6.680131188771972e+01, -1.328068155288572e+01];
c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, ...
     -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, ...
     3.754408661907416e+00];

pLow = 0.02425;
pHigh = 1 - pLow;

z = zeros(size(p));
low = p < pLow;
high = p > pHigh;
mid = ~(low | high);

if any(low(:))
    q = sqrt(-2 * log(p(low)));
    z(low) = (((((c(1)*q+c(2))*q+c(3))*q+c(4))*q+c(5))*q+c(6)) / ...
        ((((d(1)*q+d(2))*q+d(3))*q+d(4))*q+1);
end

if any(mid(:))
    q = p(mid) - 0.5;
    r = q .* q;
    z(mid) = (((((a(1)*r+a(2))*r+a(3))*r+a(4))*r+a(5))*r+a(6)) .* q ./ ...
        (((((b(1)*r+b(2))*r+b(3))*r+b(4))*r+b(5))*r+1);
end

if any(high(:))
    q = sqrt(-2 * log(1 - p(high)));
    z(high) = -(((((c(1)*q+c(2))*q+c(3))*q+c(4))*q+c(5))*q+c(6)) ./ ...
        ((((d(1)*q+d(2))*q+d(3))*q+d(4))*q+1);
end

% One Halley step against the exact CDF, which corrects the residual error
% of the rational approximation.
e = 0.5 * erfc(-z / sqrt(2)) - p;
u = e .* sqrt(2 * pi) .* exp(z .^ 2 / 2);
z = z - u ./ (1 + z .* u / 2);

z = mu + sigma .* z;
end
