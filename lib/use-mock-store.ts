"use client";

import { useSyncExternalStore } from "react";
import {
  getMockState,
  MOCK_DRIVERS,
  subscribeMockStore,
  type MockState,
} from "@/lib/mock-store";

const serverSnapshot: MockState = {
  drivers: MOCK_DRIVERS.map((driver) => ({ ...driver })),
  trips: [],
};

export function useHydrated() {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}

export function useMockStore() {
  return useSyncExternalStore(
    subscribeMockStore,
    getMockState,
    () => serverSnapshot,
  );
}
