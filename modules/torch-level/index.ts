import { requireNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

// Native TorchLevel module is iOS-only. On other platforms the calls are no-ops
// so callers don't need a platform guard.
const TorchLevel = Platform.OS === 'ios' ? requireNativeModule('TorchLevel') : null;

// Turn the torch on at a given brightness. level: 0.0–1.0 (clamped natively).
export async function setTorchLevel(level: number): Promise<void> {
  if (!TorchLevel) return;
  await TorchLevel.setLevel(level);
}

export async function turnOffTorch(): Promise<void> {
  if (!TorchLevel) return;
  await TorchLevel.turnOff();
}
