import React, { createContext, useContext, useState } from 'react';

interface ActiveContextValue {
  profileId: string | null;
  trainerId: string | null;
  setActiveContext: (profileId: string, trainerId?: string) => void;
}

const ActiveContextCtx = createContext<ActiveContextValue>({
  profileId: null,
  trainerId: null,
  setActiveContext: () => {},
});

export function ActiveContextProvider({ children }: { children: React.ReactNode }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [trainerId, setTrainerId] = useState<string | null>(null);

  const setActiveContext = (pid: string, tid?: string) => {
    setProfileId(pid);
    setTrainerId(tid ?? null);
  };

  return (
    <ActiveContextCtx.Provider value={{ profileId, trainerId, setActiveContext }}>
      {children}
    </ActiveContextCtx.Provider>
  );
}

export function useActiveContext() {
  return useContext(ActiveContextCtx);
}
