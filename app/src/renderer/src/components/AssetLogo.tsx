import type { Asset } from '@simulador/shared';
import { useEffect, useState } from 'react';

/** Logos já pedidos nesta sessão do app: cada um vem do servidor uma vez só. */
const cache = new Map<string, Promise<string | null>>();

function loadLogo(id: string): Promise<string | null> {
  let logo = cache.get(id);
  if (!logo) {
    logo = window.api.assets.logo(id).then((result) => (result.ok ? result.data : null));
    cache.set(id, logo);
    // Falha de rede não fica guardada: a próxima tela tenta de novo.
    void logo.then((value) => {
      if (value === null) cache.delete(id);
    });
  }
  return logo;
}

/** As letras do círculo: as duas primeiras do ticker ("PE" de PETR4, "MX" de MXRF11). */
export function logoInitials(ticker: string): string {
  return ticker.slice(0, 2);
}

/**
 * Logo do ativo (SPEC-040 §5.3), entregue pelo nosso servidor. Sem logo próprio, ou enquanto ele
 * não chega, um círculo com as letras do ticker, numa cor para ação e outra para FII. É só
 * decoração: o ticker está sempre ao lado.
 */
export function AssetLogo({
  asset,
}: {
  asset: Pick<Asset, 'id' | 'ticker' | 'class' | 'hasLogo'>;
}) {
  // A imagem guarda de qual ativo ela é: se a linha passa a mostrar outro, a antiga não aparece.
  const [loaded, setLoaded] = useState<{ id: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!asset.hasLogo) return;
    let current = true;
    void loadLogo(asset.id).then((src) => {
      if (current) setLoaded({ id: asset.id, src });
    });
    return () => {
      current = false;
    };
  }, [asset.id, asset.hasLogo]);

  const src = asset.hasLogo && loaded?.id === asset.id ? loaded.src : null;
  if (src) {
    return <img className="asset-logo" src={src} alt="" width={32} height={32} />;
  }
  return (
    <span className={`asset-logo asset-initials is-${asset.class}`} aria-hidden="true">
      {logoInitials(asset.ticker)}
    </span>
  );
}
