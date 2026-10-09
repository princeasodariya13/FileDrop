import { DeviceType } from "@/types/room";

export function getDeviceBaseNameAndType(): { baseName: string; deviceType: DeviceType } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { baseName: "Connected Device", deviceType: "unknown" };
  }

  const ua = navigator.userAgent || "";
  let deviceType: DeviceType = "desktop";
  let baseName = "Device";

  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
    baseName = "iPad";
    if (!/ipad/i.test(ua)) baseName = "Tablet Device";
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = "mobile";
    if (/iphone/i.test(ua)) baseName = "iPhone";
    else if (/android/i.test(ua)) baseName = "Android Device";
    else baseName = "Mobile Device";
  } else {
    deviceType = "desktop";
    if (/macintosh|mac os x/i.test(ua)) baseName = "Mac Device";
    else if (/windows/i.test(ua)) baseName = "Windows User";
    else if (/linux/i.test(ua)) baseName = "Linux Device";
    else baseName = "Desktop PC";
  }

  return { baseName, deviceType };
}

/**
 * Computes a distinct, non-conflicting default device name given existing devices in a room.
 * For example:
 * - 1st Windows device -> "Windows User 1"
 * - 2nd Windows device -> "Windows User 2"
 * - 1st Android device -> "Android Device 1"
 * - 2nd Android device -> "Android Device 2"
 */
export function getSmartDeviceName(existingDeviceNames?: string[]): { deviceName: string; deviceType: DeviceType } {
  const { baseName, deviceType } = getDeviceBaseNameAndType();

  if (!existingDeviceNames || existingDeviceNames.length === 0) {
    return { deviceName: `${baseName} 1`, deviceType };
  }

  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, "i");

  const existingNumbers = new Set<number>();

  for (const name of existingDeviceNames) {
    if (!name) continue;
    const trimmed = name.trim();
    const match = trimmed.match(regex);
    if (match) {
      if (match[1]) {
        existingNumbers.add(parseInt(match[1], 10));
      } else {
        existingNumbers.add(1);
      }
    }
  }

  if (existingNumbers.size === 0) {
    return { deviceName: `${baseName} 1`, deviceType };
  }

  let nextNumber = 1;
  while (existingNumbers.has(nextNumber)) {
    nextNumber++;
  }

  return { deviceName: `${baseName} ${nextNumber}`, deviceType };
}

export function getDeviceDefaults(existingDeviceNames?: string[]): { deviceName: string; deviceType: DeviceType } {
  return getSmartDeviceName(existingDeviceNames);
}
