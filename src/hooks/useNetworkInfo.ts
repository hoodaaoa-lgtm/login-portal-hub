import { useState, useEffect } from "react";

  export type EffectiveType = "slow-2g" | "2g" | "3g" | "4g" | undefined;

  export interface NetworkInfo {
    isMobileData: boolean;
    isSlowConnection: boolean;
    effectiveType: EffectiveType;
    isOnline: boolean;
  }

  declare global {
    interface Navigator {
      connection?: {
        effectiveType?: EffectiveType;
        type?: string;
        saveData?: boolean;
        addEventListener(type: string, cb: () => void): void;
        removeEventListener(type: string, cb: () => void): void;
      };
    }
  }

  function getInfo(): NetworkInfo {
    const conn = navigator.connection;
    const et = conn?.effectiveType;
    const isMobileData = conn?.type ? ["cellular","wimax"].includes(conn.type) : false;
    const isSlowConnection = conn?.saveData === true || et === "slow-2g" || et === "2g" || et === "3g";
    return { isMobileData, isSlowConnection, effectiveType: et, isOnline: navigator.onLine };
  }

  export function useNetworkInfo(): NetworkInfo {
    const [info, setInfo] = useState<NetworkInfo>(getInfo);
    useEffect(() => {
      const update = () => setInfo(getInfo());
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      navigator.connection?.addEventListener("change", update);
      return () => {
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
        navigator.connection?.removeEventListener("change", update);
      };
    }, []);
    return info;
  }
  