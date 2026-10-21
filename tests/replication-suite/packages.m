%% RP-AER-01: A Balls-and-Bins Model of Trade (Armenter & Koren, AER 2014)
% Section IV of the replication package (code/SectionIV.m). The script is
% self-contained: it calibrates a log-normal firm-size distribution and
% derives the share of exporters and the exporter size premium.
% Source: https://github.com/korenmiklos/Balls-and-Bins-AER (code/SectionIV.m)
clear;

% Calibration parameters
bs = 36000;               % Ball size in dollars
mu_sales = 13.4;          % Log-normal parameters in dollars
sigma = 2.44;
exp_share = .139;         % Share of export revenue -- bin size

% Log-normal distribution over number of balls
mu = mu_sales - log(bs);

K = logninv(0.999, mu, sigma);
contgrid = [0.01:0.01:K];
N = length(contgrid);
n = ceil(contgrid);

% Cumulative density function
ld_cdf = logncdf(contgrid, mu, sigma);

% Point density function
ld_pdf(1) = ld_cdf(1);
ld_pdf(2:N) = ld_cdf(2:N) - ld_cdf(1:N-1);

% Ensure probability distribution is proper
ld_pdf = ld_pdf / sum(ld_pdf);

% Compute share and exporter premium
sh_exp = 1 - ld_pdf * ((1 - exp_share).^n)';
total = ld_pdf * log(bs * contgrid');
va_nonexp = (ld_pdf .* log(bs * contgrid)) * ((1 - exp_share).^n)';
va_exp = total - va_nonexp;
ave_nonexp = va_nonexp / (1 - sh_exp);
ave_exp = va_exp / sh_exp;
premium_exp = ave_exp - ave_nonexp;

disp(['Share of exporters : ' num2str(sh_exp)])
disp(['Exporter sized premium (logs) : ' num2str(premium_exp)])

% Additional self-contained statistics from the same model
disp(['K cutoff : ' num2str(K)])
disp(['N grid points : ' num2str(N)])
disp(['Total log size : ' num2str(total)])
disp(['Average non-exporter size : ' num2str(ave_nonexp)])
disp(['Average exporter size : ' num2str(ave_exp)])
disp(['Sum of density : ' num2str(sum(ld_pdf))])

%% RP-AER-02: A Balls-and-Bins Model of Trade (Armenter & Koren, AER 2014)
% Section III of the replication package, restricted to the deterministic
% extensive-margin computation with a synthetic (self-contained) bin-size
% distribution instead of the census data the original script reads.
% Source: https://github.com/korenmiklos/Balls-and-Bins-AER (code/SectionIII.m)
clear;

% Calibration parameters
bs = 36000;
sigma_x = 3;
mu_x = 11;

% Synthetic bin sizes (the original reads census shares from CSV)
s_prod = [0.2 0.15 0.1 0.08 0.07 0.06 0.05 0.04 0.03 0.02 0.01 0.01];
s_dest = [0.3 0.2 0.15 0.1 0.08 0.06 0.04 0.03 0.02 0.02];
s_prod = s_prod / sum(s_prod);
s_dest = s_dest / sum(s_dest);

% Log-normal distribution over number of balls
mu = mu_x - log(bs);
sigma = sigma_x;
N = 800;

% Cumulative and point density
ld_cdf = logncdf(1:N, mu, sigma);
ld_pdf(1) = ld_cdf(1);
ld_pdf(2:N) = ld_cdf(2:N) - ld_cdf(1:N-1);
ld_pdf = ld_pdf / sum(ld_pdf);

% Extensive-margin functions
emf = zeros(3, N);
for in = 1:N
    n = in;
    emf(1, in) = sum(s_prod.^n);
    emf(2, in) = sum(s_dest.^n);
    emf(3, in) = emf(1, in) * emf(2, in);
end

share = 100 * sum(repmat(ld_pdf, 3, 1) .* emf, 2);
values = 100 * sum(repmat(ld_pdf, 3, 1) .* emf .* repmat((1:N), 3, 1), 2) / exp(mu + 0.5 * sigma^2);

disp('Share (%) of single product/country/product-country exporters: ')
disp(num2str(share))
disp('Share (%) of single product/country/product-country export revenue: ')
disp(num2str(values))

%% RP-JPE-01: Innovation, Firm Dynamics and International Trade
% (Atkeson & Burstein, JPE 2010). The replication package's calibration
% stage (calibrate_nx.m / Master_AB.m) is reproduced on a reduced grid so
% the run finishes in seconds; the structure of the computation is kept.
% Source: https://github.com/mwaugh0328/atkeson-burstein-2010
clear;

% Parameters (from the package's parameter table, case 30)
per = 6;
annualr = 0.0283;
bold = 30;
lambda = 1;
nx = 0.725;
anndelta = 0.02;
sigma = 0.25;
rho = 3.17;
slope = -0.25;
shtrade = 0.1063;
shNT = 0.4;
nf = 0.1;
z0 = 0;
L = 1;
n = 1;
T = 60;
tol = 1e-7;
periodmass = 300;

% Derived parameters
r = (1 + annualr)^(1 / per) - 1;
delta = 1 - (1 - anndelta)^(1 / per);
beta = 1 / (1 + r);
s = sigma / per^0.5;
yy = exp((slope - 1) * s);
qcal = 1 / (1 - yy^2) * (yy / (1 - delta) - yy^2);
b = bold * 2 * s * per;
D_1_rho = shtrade / shNT / (1 - shtrade / shNT);

disp(['Interest rate (period) : ' num2str(r)])
disp(['Depreciation (period) : ' num2str(delta)])
disp(['Discount factor : ' num2str(beta)])
disp(['Calibrated q : ' num2str(qcal)])
disp(['Innovation cost b : ' num2str(b)])
disp(['D^(1-rho) : ' num2str(D_1_rho)])

% Grid of productivity states
grid = [-(T - 1):1:(T - 1)]';
vecemployD = exp(z0 + s * grid);
N = length(grid);

disp(['Grid size : ' num2str(N)])
disp(['Min employment : ' num2str(min(vecemployD))])
disp(['Max employment : ' num2str(max(vecemployD))])

% Value-function iteration
%
% This is the package's Fixed.m, transcribed for the reduced grid. The
% formulas, the policy-function clamp and the convergence criterion are the
% package's own; only the grid size differs.
%
% Source: Fixed.m in the replication package.
Pid = 0.5;
H0 = 0;
Vtop = (1 + D_1_rho) * Pid / (1 + beta * (1 - delta) * ((exp(s) - exp(-s)) * (1 / b - qcal) - exp(-s)));
H = beta * (1 - delta) * Vtop * (exp(s) - exp(-s)) / b / exp(qcal * b);
V = Vtop .* vecemployD;
Vx = max(Pid * vecemployD * D_1_rho - nx, 0);

tolV = 1e-10;
diffV = 100;
iterV = 1;
while diffV > tolV
    Vup = [V(2:end, 1); V(end) * exp(s)];
    Vdown = [0; V(1:end - 1, 1)];
    Vdiff = Vup - Vdown;
    findpos = find(Vdiff > 0);

    % Policy function for q, from the FOC
    % b * exp(q * b) * H = beta * (1 - delta) * (V(z + s) - V(z - s)).
    vecq = zeros(N, 1);
    vecq(findpos) = log(beta * (1 - delta) ./ (b * H * vecemployD(findpos)) .* Vdiff(findpos)) / b;
    vecq(find(vecq < 0)) = 0;
    vecq(find(vecq > 1)) = 1;

    c_q = H * vecemployD .* exp(vecq * b);
    Vc = Pid * vecemployD - nf - c_q + Vx + (1 - delta) * beta * (vecq .* Vup + (1 - vecq) .* Vdown);
    Vnew = max(0, Vc);
    diffV = max(abs(log(V(find(Vnew > 0)) ./ Vnew(find(Vnew > 0)))));
    V = Vnew;
    iterV = iterV + 1;
end

disp(['Value function iterations : ' num2str(iterV)])
disp(['Final value difference : ' num2str(diffV)])
disp(['H : ' num2str(H)])
disp(['Vtop : ' num2str(Vtop)])
disp(['Export value add (mean) : ' num2str(mean(Vx))])
disp(['Mean value : ' num2str(mean(V))])

%% RP-AER-03: Overborrowing and Systemic Externalities in the Business Cycle
% (Bianchi, AER 2011). The replication package's Markov-chain routines
% (tauchen.m, markov.m, fn_VAR_to_markov.m) are exercised on a small
% example: an AR(1) discretisation plus a simulation of the resulting chain.
% Source: https://github.com/dromeroc/bianchi_2011
clear;

% Discretise an AR(1) process with the Tauchen algorithm
N = 7;
mu = 0;
rho = 0.9;
sigma = 0.1;
m = 3;

Z = zeros(N, 1);
Zprob = zeros(N, N);
a = (1 - rho) * mu;
Z(N) = m * sqrt(sigma^2 / (1 - rho^2));
Z(1) = -Z(N);
zstep = (Z(N) - Z(1)) / (N - 1);
for i = 2:(N - 1)
    Z(i) = Z(1) + zstep * (i - 1);
end
Z = Z + a / (1 - rho);

for j = 1:N
    for k = 1:N
        if k == 1
            Zprob(j, k) = 0.5 * erfc(-((Z(1) - a - rho * Z(j) + zstep / 2) / sigma) / sqrt(2));
        elseif k == N
            Zprob(j, k) = 1 - 0.5 * erfc(-((Z(N) - a - rho * Z(j) - zstep / 2) / sigma) / sqrt(2));
        else
            Zprob(j, k) = 0.5 * erfc(-((Z(k) - a - rho * Z(j) + zstep / 2) / sigma) / sqrt(2)) ...
                       - 0.5 * erfc(-((Z(k) - a - rho * Z(j) - zstep / 2) / sigma) / sqrt(2));
        end
    end
end

disp('AR(1) grid:')
disp(Z')
disp('Transition matrix row sums:')
disp(sum(Zprob, 2)')

% Simulate the chain
V = [1:N];
s0 = 1;
nsim = 50;
X = rand(nsim - 1, 1);
s = zeros(N, 1);
s(s0) = 1;
cum = Zprob * triu(ones(N, N));
state = zeros(N, nsim);
for k = 1:length(X)
    state(:, k) = s;
    ppi = [0 s' * cum];
    s = ((X(k) <= ppi(2:N + 1)) .* (X(k) > ppi(1:N)))';
end
chain = V * state;

disp(['Chain length : ' num2str(length(chain))])
disp(['Chain mean : ' num2str(mean(chain))])
disp(['Chain min : ' num2str(min(chain))])
disp(['Chain max : ' num2str(max(chain))])
disp('First 10 states:')
disp(chain(1:10)')

% Stationary distribution implied by the transition matrix
disp('Row 1 of the transition matrix:')
disp(Zprob(1, :))
