import {
  ArrowDown,
  ArrowUpRight,
  Buildings,
  ChartBar,
  ChartLineUp,
  ClockCounterClockwise,
  Equals,
  Factory,
  Flask,
  GraduationCap,
  HandCoins,
  Lightning,
  LockKey,
  Newspaper,
  Scales,
  ShieldCheck,
  Sparkle,
  TrendDown,
  TrendUp,
  Wallet,
  type Icon,
} from '@phosphor-icons/react';
import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import '../landing.css';
import { ServerStatusPanel } from './ServerStatusPanel';

interface AuthLandingProps {
  /** Formulário da tela atual (carregando, entrar, criar conta ou Área do colaborador). */
  children: ReactNode;
  onCreateAccount: () => void;
  onSignIn: () => void;
}

/** Os oito itens da fórmula da Visão de produto (§4), na ordem em que entram na tela. */
const TILES: ReadonlyArray<{ key: string; icon: Icon }> = [
  { key: 'portfolio', icon: Wallet },
  { key: 'news', icon: Newspaper },
  { key: 'history', icon: ClockCounterClockwise },
  { key: 'ai', icon: Sparkle },
  { key: 'virtual', icon: Flask },
  { key: 'charts', icon: ChartBar },
  { key: 'simulations', icon: ChartLineUp },
  { key: 'learn', icon: GraduationCap },
];

const STEPS: ReadonlyArray<{ key: string; icon: Icon }> = [
  { key: 'build', icon: Wallet },
  { key: 'follow', icon: ChartLineUp },
  { key: 'relate', icon: Newspaper },
  { key: 'learn', icon: GraduationCap },
];

const SENTIMENTS: ReadonlyArray<{ key: string; icon: Icon }> = [
  { key: 'positive', icon: TrendUp },
  { key: 'neutral', icon: Equals },
  { key: 'negative', icon: TrendDown },
];

const TRUST: ReadonlyArray<{ key: string; icon: Icon }> = [
  { key: 'noMoney', icon: HandCoins },
  { key: 'education', icon: Scales },
  { key: 'password', icon: LockKey },
  { key: 'privacy', icon: ShieldCheck },
];

const STOCK_EXAMPLES = ['PETR4', 'VALE3', 'TAEE11'];
const REIT_EXAMPLES = ['MXRF11', 'HGLG11'];

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Página de entrada (SPEC-002): apresenta o produto a partir dos documentos do projeto e
 * mantém o acesso (login, cadastro ou Área do colaborador) sempre no topo, ao lado do título.
 * Só apresentação: os formulários e as regras de autenticação continuam nos componentes deles.
 */
export function AuthLanding({ children, onCreateAccount, onSignIn }: AuthLandingProps) {
  const { t } = useTranslation();
  // O título tem duas frases: a segunda ganha a cor de destaque, em linha própria.
  const [titleFirst, ...rest] = t('landing.hero.title').split(/(?<=\.)\s+/);
  const titleRest = rest.join(' ');

  /** Troca o formulário, leva a pessoa até o acesso e coloca o foco no primeiro campo. */
  const goToAccess = (switchForm: () => void) => (event?: MouseEvent) => {
    event?.preventDefault();
    switchForm();
    // Dois quadros: espera o React desenhar o formulário novo antes de rolar e focar.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const access = document.getElementById('acesso');
        access?.scrollIntoView({
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          block: 'start',
        });
        access?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
      }),
    );
  };

  return (
    <div className="landing">
      <a className="skip-link" href="#acesso">
        {t('landing.skip')}
      </a>

      <header className="island-wrap">
        <nav className="island" aria-label={t('landing.nav.label')}>
          <a className="brand" href="#inicio">
            <span className="brand-mark" aria-hidden="true">
              <ChartLineUp weight="bold" />
            </span>
            <span className="brand-name">{t('app.title')}</span>
          </a>
          <ul className="island-links">
            <li>
              <a href="#como-funciona">{t('landing.nav.how')}</a>
            </li>
            <li>
              <a href="#carteiras">{t('landing.nav.portfolios')}</a>
            </li>
            <li>
              <a href="#noticias">{t('landing.nav.news')}</a>
            </li>
            <li>
              <a href="#acoes-e-fiis">{t('landing.nav.assets')}</a>
            </li>
          </ul>
          <a className="pill pill-primary pill-small" href="#acesso" onClick={goToAccess(onSignIn)}>
            {t('landing.nav.signIn')}
            <span className="pill-icon" aria-hidden="true">
              <ArrowUpRight weight="bold" />
            </span>
          </a>
        </nav>
      </header>

      <main>
        <section id="inicio" className="hero" aria-labelledby="hero-title">
          <div className="hero-glow" aria-hidden="true" />
          <div className="hero-copy">
            <p className="eyebrow">{t('landing.hero.eyebrow')}</p>
            <h1 id="hero-title">
              <span className="hero-line">{titleFirst}</span>{' '}
              {titleRest && <span className="hero-line hero-accent">{titleRest}</span>}
            </h1>
            <p className="lead">{t('landing.hero.lead')}</p>
            <a className="pill pill-ghost" href="#como-funciona">
              {t('landing.hero.secondary')}
              <span className="pill-icon" aria-hidden="true">
                <ArrowDown weight="bold" />
              </span>
            </a>
          </div>

          <div id="acesso" className="access">
            <div className="bezel">
              <div className="bezel-core access-core">{children}</div>
            </div>
            <ServerStatusPanel />
          </div>
        </section>

        <section className="stage" aria-labelledby="stage-title">
          <div className="stage-center bezel">
            <div className="bezel-core">
              <h2 id="stage-title">{t('landing.stage.title')}</h2>
              <p>{t('landing.stage.lead')}</p>
            </div>
          </div>
          <ul className="stage-tiles" aria-label={t('landing.stage.listLabel')}>
            {TILES.map(({ key, icon: TileIcon }, index) => (
              <li key={key} className={`tile tile-${index + 1}`}>
                <span className="tile-card">
                  <span className="tile-pin" aria-hidden="true" />
                  <span className="tile-icon" aria-hidden="true">
                    <TileIcon weight="light" />
                  </span>
                  <span className="tile-label">{t(`landing.stage.tiles.${key}`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section id="como-funciona" className="how section" aria-labelledby="how-title">
          <div className="how-intro">
            <h2 id="how-title">{t('landing.how.title')}</h2>
            <p>{t('landing.how.lead')}</p>
          </div>
          <ol className="how-steps">
            {STEPS.map(({ key, icon: StepIcon }) => (
              <li key={key} className="how-step reveal">
                <span className="round-icon" aria-hidden="true">
                  <StepIcon weight="light" />
                </span>
                <div>
                  <h3>{t(`landing.how.${key}.title`)}</h3>
                  <p>{t(`landing.how.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="carteiras" className="portfolios section" aria-labelledby="portfolios-title">
          <h2 id="portfolios-title" className="section-title reveal">
            {t('landing.portfolios.title')}
          </h2>
          <div className="bento">
            <article className="bento-cell bento-live reveal">
              <span className="round-icon" aria-hidden="true">
                <Lightning weight="light" />
              </span>
              <h3>{t('landing.portfolios.live.title')}</h3>
              <p>{t('landing.portfolios.live.text')}</p>
            </article>
            <article className="bento-cell bento-historic reveal">
              <span className="round-icon" aria-hidden="true">
                <ClockCounterClockwise weight="light" />
              </span>
              <h3>{t('landing.portfolios.historic.title')}</h3>
              <p>{t('landing.portfolios.historic.text')}</p>
              <blockquote>“{t('landing.portfolios.historic.quote')}”</blockquote>
            </article>
          </div>
        </section>

        <section id="noticias" className="news section" aria-labelledby="news-title">
          <div className="news-copy reveal">
            <h2 id="news-title">{t('landing.news.title')}</h2>
            <p>{t('landing.news.lead')}</p>
            <p className="news-note">{t('landing.news.note')}</p>
          </div>
          <ul className="news-cards">
            {SENTIMENTS.map(({ key, icon: SentimentIcon }) => (
              <li key={key} className={`news-card news-${key}`}>
                <span className="news-icon" aria-hidden="true">
                  <SentimentIcon weight="bold" />
                </span>
                <div>
                  <h3>{t(`landing.news.${key}.title`)}</h3>
                  <p>{t(`landing.news.${key}.text`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section id="acoes-e-fiis" className="assets section" aria-labelledby="assets-title">
          <p className="eyebrow reveal">{t('landing.assets.eyebrow')}</p>
          <h2 id="assets-title" className="section-title reveal">
            {t('landing.assets.title')}
          </h2>
          <div className="assets-grid">
            <article className="asset reveal">
              <span className="round-icon" aria-hidden="true">
                <Factory weight="light" />
              </span>
              <h3>{t('landing.assets.stock.title')}</h3>
              <p>{t('landing.assets.stock.text')}</p>
              <p className="tickers">
                <span className="tickers-label">{t('landing.assets.examples')}</span>
                {STOCK_EXAMPLES.map((ticker) => (
                  <span key={ticker} className="ticker" translate="no">
                    {ticker}
                  </span>
                ))}
              </p>
            </article>
            <article className="asset reveal">
              <span className="round-icon" aria-hidden="true">
                <Buildings weight="light" />
              </span>
              <h3>{t('landing.assets.reit.title')}</h3>
              <p>{t('landing.assets.reit.text')}</p>
              <p className="tickers">
                <span className="tickers-label">{t('landing.assets.examples')}</span>
                {REIT_EXAMPLES.map((ticker) => (
                  <span key={ticker} className="ticker" translate="no">
                    {ticker}
                  </span>
                ))}
              </p>
            </article>
          </div>
          <aside className="asset-tip reveal">
            <strong>{t('landing.assets.tip.title')}</strong> {t('landing.assets.tip.text')}
          </aside>
        </section>

        <section className="trust section" aria-labelledby="trust-title">
          <h2 id="trust-title" className="section-title reveal">
            {t('landing.trust.title')}
          </h2>
          <ul className="trust-grid">
            {TRUST.map(({ key, icon: TrustIcon }) => (
              <li key={key} className="trust-item reveal">
                <span className="round-icon" aria-hidden="true">
                  <TrustIcon weight="light" />
                </span>
                <h3>{t(`landing.trust.${key}.title`)}</h3>
                <p>{t(`landing.trust.${key}.text`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="cta section" aria-labelledby="cta-title">
          <div className="cta-glow" aria-hidden="true" />
          <h2 id="cta-title" className="reveal">
            {t('landing.cta.title')}
          </h2>
          <p className="reveal">{t('landing.cta.lead')}</p>
          <div className="cta-actions reveal">
            <button
              type="button"
              className="pill pill-primary"
              onClick={goToAccess(onCreateAccount)}
            >
              {t('landing.cta.register')}
              <span className="pill-icon" aria-hidden="true">
                <ArrowUpRight weight="bold" />
              </span>
            </button>
            <button type="button" className="pill pill-ghost" onClick={goToAccess(onSignIn)}>
              {t('landing.cta.signIn')}
            </button>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand" aria-hidden="true">
          <span className="brand-mark">
            <ChartLineUp weight="bold" />
          </span>
          <span className="brand-name">{t('app.title')}</span>
        </div>
        <p>{t('landing.footer.project')}</p>
        <p>{t('landing.footer.team')}</p>
        <p className="site-footer-disclaimer">{t('disclaimer')}</p>
      </footer>
    </div>
  );
}
