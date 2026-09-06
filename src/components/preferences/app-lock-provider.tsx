"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/components/i18n/i18n-provider";
import { AppLockScreen } from "@/components/preferences/app-lock-screen";
import {
  clearLockConfig,
  readLockConfig,
  readSessionLocked,
  writeLockConfig,
  writeSessionLocked,
  type AppLockStored,
} from "@/lib/app-lock-config";
import { buildStoredPasscode, isValidPasscodeFormat, verifyPasscode } from "@/lib/app-lock-crypto";
import { envPublicAppLockTimeoutMs } from "@/lib/env-public";
import { authenticateAppLockCredential, registerAppLockCredential } from "@/lib/webauthn-app-lock";

export type AppLockContextValue = {
  hasAppLock: boolean;
  isAppLocked: boolean;
  biometricRegistered: boolean;
  lockNow: () => void;
  setupAppLock: (passcode: string) => Promise<void>;
  disableAppLock: () => void;
  changePasscode: (oldCode: string, newCode: string) => Promise<{ ok: boolean }>;
  registerBiometric: () => Promise<boolean>;
  removeBiometric: () => void;
  refreshLockState: () => void;
  /** Verify passcode without changing app lock session state (e.g. Locked chats folder). */
  verifyPasscodeOnly: (code: string) => Promise<boolean>;
  /** Verify WebAuthn without unlocking the app (e.g. Locked chats folder). */
  verifyBiometricOnly: () => Promise<boolean>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used within AppLockProvider");
  return ctx;
}

export function useAppLockOptional(): AppLockContextValue | null {
  return useContext(AppLockContext);
}

export function AppLockProvider({
  userId,
  userName,
  userEmail,
  children,
}: {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const timeoutMs = useMemo(() => envPublicAppLockTimeoutMs(), []);
  const [revision, setRevision] = useState(0);
  const lastActivityRef = useRef(Date.now());

  const [isAppLocked, setIsAppLocked] = useState(() => {
    if (typeof window === "undefined") return false;
    return readSessionLocked(userId) && !!readLockConfig(userId);
  });

  const lockConfig = useMemo(() => readLockConfig(userId), [userId, revision]);
  const hasAppLock = !!lockConfig;
  const biometricRegistered = !!lockConfig?.webAuthnCredentialIdB64;

  const refreshLockState = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);

  useLayoutEffect(() => {
    const cfg = readLockConfig(userId);
    if (!cfg) {
      writeSessionLocked(userId, false);
      setIsAppLocked(false);
      return;
    }
    if (readSessionLocked(userId)) {
      setIsAppLocked(true);
    }
  }, [userId, revision]);

  const lockNow = useCallback(() => {
    if (!readLockConfig(userId)) return;
    writeSessionLocked(userId, true);
    setIsAppLocked(true);
  }, [userId]);

  const unlockSuccess = useCallback(() => {
    writeSessionLocked(userId, false);
    setIsAppLocked(false);
    lastActivityRef.current = Date.now();
  }, [userId]);

  const tryPasscodeUnlock = useCallback(
    async (code: string): Promise<boolean> => {
      const cfg = readLockConfig(userId);
      if (!cfg || !isValidPasscodeFormat(code)) return false;
      const ok = await verifyPasscode(code, cfg);
      if (ok) unlockSuccess();
      return ok;
    },
    [userId, unlockSuccess]
  );

  const [bioBusy, setBioBusy] = useState(false);

  const tryBiometricUnlock = useCallback(async () => {
    const cfg = readLockConfig(userId);
    const id = cfg?.webAuthnCredentialIdB64;
    if (!id) return;
    setBioBusy(true);
    try {
      const ok = await authenticateAppLockCredential(id);
      if (ok) unlockSuccess();
    } finally {
      setBioBusy(false);
    }
  }, [userId, unlockSuccess]);

  useEffect(() => {
    if (!hasAppLock || isAppLocked) return;

    const bump = () => {
      lastActivityRef.current = Date.now();
    };

    let lastMouseBump = 0;
    const onMouseMove = () => {
      const now = Date.now();
      if (now - lastMouseBump < 750) return;
      lastMouseBump = now;
      bump();
    };

    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("keydown", bump, opts);
    window.addEventListener("click", bump, opts);
    window.addEventListener("mousemove", onMouseMove, opts);
    window.addEventListener("touchstart", bump, opts);
    window.addEventListener("wheel", bump, opts);

    const tick = window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivityRef.current >= timeoutMs) {
        lockNow();
      }
    }, 2000);

    return () => {
      window.clearInterval(tick);
      window.removeEventListener("keydown", bump);
      window.removeEventListener("click", bump);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchstart", bump);
      window.removeEventListener("wheel", bump);
    };
  }, [hasAppLock, isAppLocked, lockNow, timeoutMs]);

  useEffect(() => {
    if (!hasAppLock) return;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        lockNow();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [hasAppLock, lockNow]);

  const setupAppLock = useCallback(
    async (passcode: string) => {
      if (!isValidPasscodeFormat(passcode)) throw new Error("invalid passcode");
      const stored = await buildStoredPasscode(passcode);
      writeLockConfig(userId, stored);
      writeSessionLocked(userId, false);
      setIsAppLocked(false);
      refreshLockState();
      lastActivityRef.current = Date.now();
    },
    [userId, refreshLockState]
  );

  const disableAppLock = useCallback(() => {
    clearLockConfig(userId);
    writeSessionLocked(userId, false);
    setIsAppLocked(false);
    refreshLockState();
  }, [userId, refreshLockState]);

  const changePasscode = useCallback(
    async (oldCode: string, newCode: string): Promise<{ ok: boolean }> => {
      const cfg = readLockConfig(userId);
      if (!cfg || !isValidPasscodeFormat(newCode)) return { ok: false };
      const ok = await verifyPasscode(oldCode, cfg);
      if (!ok) return { ok: false };
      const next = await buildStoredPasscode(newCode);
      const merged: AppLockStored = {
        ...next,
        webAuthnCredentialIdB64: cfg.webAuthnCredentialIdB64 ?? null,
      };
      writeLockConfig(userId, merged);
      refreshLockState();
      return { ok: true };
    },
    [userId, refreshLockState]
  );

  const registerBiometric = useCallback(async (): Promise<boolean> => {
    const cfg = readLockConfig(userId);
    if (!cfg) return false;
    const label = userName?.trim() || userEmail?.trim() || "Mada";
    const credId = await registerAppLockCredential(label);
    if (!credId) return false;
    writeLockConfig(userId, { ...cfg, webAuthnCredentialIdB64: credId });
    refreshLockState();
    return true;
  }, [userId, userName, userEmail, refreshLockState]);

  const removeBiometric = useCallback(() => {
    const cfg = readLockConfig(userId);
    if (!cfg) return;
    writeLockConfig(userId, { ...cfg, webAuthnCredentialIdB64: null });
    refreshLockState();
  }, [userId, refreshLockState]);

  const verifyPasscodeOnly = useCallback(
    async (code: string): Promise<boolean> => {
      const cfg = readLockConfig(userId);
      if (!cfg || !isValidPasscodeFormat(code)) return false;
      return verifyPasscode(code, cfg);
    },
    [userId]
  );

  const verifyBiometricOnly = useCallback(async (): Promise<boolean> => {
    const cfg = readLockConfig(userId);
    const id = cfg?.webAuthnCredentialIdB64;
    if (!id) return false;
    return authenticateAppLockCredential(id);
  }, [userId]);

  const value = useMemo(
    () => ({
      hasAppLock,
      isAppLocked,
      biometricRegistered,
      lockNow,
      setupAppLock,
      disableAppLock,
      changePasscode,
      registerBiometric,
      removeBiometric,
      refreshLockState,
      verifyPasscodeOnly,
      verifyBiometricOnly,
    }),
    [
      hasAppLock,
      isAppLocked,
      biometricRegistered,
      lockNow,
      setupAppLock,
      disableAppLock,
      changePasscode,
      registerBiometric,
      removeBiometric,
      refreshLockState,
      verifyPasscodeOnly,
      verifyBiometricOnly,
    ]
  );

  const labels = useMemo(
    () => ({
      title: t("appLock.screenTitle"),
      subtitle: t("appLock.screenSubtitle"),
      useBiometrics: t("appLock.useBiometrics"),
      biometricsUnavailable: t("appLock.biometricsUnavailable"),
      wrongCode: t("appLock.wrongCode"),
      signOut: t("appLock.signOut"),
      keypadDelete: t("appLock.keypadDelete"),
    }),
    [t]
  );

  return (
    <AppLockContext.Provider value={value}>
      <div className="relative flex min-h-[100dvh] w-full flex-col">
        <motion.div
          className="relative flex min-h-[100dvh] w-full flex-1 flex-col"
          animate={
            isAppLocked
              ? { filter: "blur(12px)", opacity: 0.38, scale: 0.992 }
              : { filter: "blur(0px)", opacity: 1, scale: 1 }
          }
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: isAppLocked ? "none" : "auto" }}
        >
          {children}
        </motion.div>
        <AppLockScreen
          open={isAppLocked && hasAppLock}
          labels={labels}
          showBiometric={biometricRegistered}
          biometricBusy={bioBusy}
          onBiometric={() => void tryBiometricUnlock()}
          onUnlockPasscode={tryPasscodeUnlock}
        />
      </div>
    </AppLockContext.Provider>
  );
}
