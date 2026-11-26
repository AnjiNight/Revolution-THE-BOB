import { hasPremium, type MySubscription, type PremiumFeature } from '@simulador/shared';
import { createContext, useContext, useEffect, useState } from 'react';

/**
 * SPEC-025: abre a tela Plano de qualquer lugar (o cadeado dos recursos premium). `feature` diz
 * qual recurso levou até lá, para a tela explicar.
 */
export const PlanContext = createContext<{ openPlan: (feature?: PremiumFeature) => void }>({
  openPlan: () => undefined,
});

export function useOpenPlan(): (feature?: PremiumFeature) => void {
  return useContext(PlanContext).openPlan;
}

/**
 * Pode usar os recursos do Assinante? `null` enquanto lê (o botão aparece sem cadeado até a
 * resposta; o servidor bloqueia de qualquer jeito, DA12). Sem a leitura, `null` também.
 */
export function usePremium(): boolean | null {
  const [premium, setPremium] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void window.api.subscription.mine().then((result) => {
      if (active && result.ok) setPremium(hasPremium(result.data));
    });
    return () => {
      active = false;
    };
  }, []);
  return premium;
}

/** Preço em reais de um plano (centavos): "R$ 19,90". */
export function formatPlanPrice(cents: number, language: string): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency: 'BRL' }).format(
    cents / 100,
  );
}

/** Termina em até tantos dias, sem renovação: o aviso do Início (SPEC-025 §4.2). */
export function endingSoon(
  subscription: MySubscription | null,
  now: Date,
  days: number,
): string | null {
  const current = subscription?.subscription;
  if (!current || current.autoRenew) return null;
  const left = new Date(current.endsAt).getTime() - now.getTime();
  return left > 0 && left <= days * 24 * 60 * 60_000 ? current.endsAt : null;
}
