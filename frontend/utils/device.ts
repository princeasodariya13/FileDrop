import { DeviceType } from "@/types/room";

export function getDeviceDefaults(): { deviceName: string; deviceType: DeviceType } {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { deviceName: "Web Device", deviceType: "unknown" };
  }

  const ua = navigator.userAgent || "";
  let deviceType: DeviceType = "desktop";
  let deviceName = "Web Browser";

  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    deviceType = "tablet";
    deviceName = "Tablet Device";
  } else if (/mobile|iphone|ipod|android|blackberry|iemobile|kindle/i.test(ua)) {
    deviceType = "mobile";
    if (/iphone/i.test(ua)) deviceName = "iPhone";
    else if (/android/i.test(ua)) deviceName = "Android Device";
    else deviceName = "Mobile Phone";
  } else {
    deviceType = "desktop";
    if (/macintosh|mac os x/i.test(ua)) deviceName = "Mac Device";
    else if (/windows/i.test(ua)) deviceName = "Windows PC";
    else if (/linux/i.test(ua)) deviceName = "Linux Device";
    else deviceName = "Desktop PC";
  }

  return { deviceName, deviceType };
}
