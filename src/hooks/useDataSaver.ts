import { useSyncExternalStore } from "react";
import { isDataSaverEnabled, subscribeDataSaver } from "@/lib/dataSaver";

/** Lê o estado do Baya Leve de forma reativa — re-renderiza qualquer
 * componente que o use assim que o utilizador liga/desliga o modo em
 * Definições (ou noutro separador aberto). */
export function useDataSaverEnabled(): boolean {
  return useSyncExternalStore(subscribeDataSaver, isDataSaverEnabled, () => false);
}
