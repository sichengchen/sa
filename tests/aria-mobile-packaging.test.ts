import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mobilePackageJsonPath = new URL("../apps/aria-mobile/package.json", import.meta.url);
const mobileAppJsonPath = new URL("../apps/aria-mobile/app.json", import.meta.url);
const mobileEasJsonPath = new URL("../apps/aria-mobile/eas.json", import.meta.url);

describe("aria-mobile packaging surface", () => {
  test("declares expo and EAS build scripts for mobile release workflows", async () => {
    const packageJson = JSON.parse(await readFile(mobilePackageJsonPath, "utf-8")) as {
      main?: string;
      scripts?: Record<string, string>;
    };

    expect(packageJson.main).toBe("expo/AppEntry");
    expect(packageJson.scripts).toMatchObject({
      dev: "expo start --clear",
      start: "expo start",
      android: "expo start --android",
      ios: "expo start --ios",
      doctor: "expo-doctor",
      prebuild: "expo prebuild",
      export: "expo export --platform ios,android",
      "build:android": "eas build --platform android --profile preview",
      "build:ios": "eas build --platform ios --profile preview",
      "build:production": "eas build --platform all --profile production",
      "submit:android": "eas submit --platform android --profile production",
      "submit:ios": "eas submit --platform ios --profile production",
    });
  });

  test("defines Expo native app identifiers and update policy", async () => {
    const appJson = JSON.parse(await readFile(mobileAppJsonPath, "utf-8")) as {
      expo?: {
        name?: string;
        slug?: string;
        scheme?: string;
        orientation?: string;
        userInterfaceStyle?: string;
        runtimeVersion?: { policy?: string };
        updates?: { fallbackToCacheTimeout?: number };
        ios?: { supportsTablet?: boolean; bundleIdentifier?: string };
        android?: { package?: string };
      };
    };

    expect(appJson.expo).toMatchObject({
      name: "Aria Mobile",
      slug: "aria-mobile",
      scheme: "aria-mobile",
      orientation: "portrait",
      userInterfaceStyle: "automatic",
      runtimeVersion: {
        policy: "appVersion",
      },
      updates: {
        fallbackToCacheTimeout: 0,
      },
      ios: {
        supportsTablet: true,
        bundleIdentifier: "dev.esperta.ariamobile",
      },
      android: {
        package: "dev.esperta.ariamobile",
      },
    });
  });

  test("defines EAS build profiles for development, preview, and production", async () => {
    const easJson = JSON.parse(await readFile(mobileEasJsonPath, "utf-8")) as {
      cli?: { version?: string; appVersionSource?: string };
      build?: Record<string, Record<string, unknown>>;
      submit?: Record<string, Record<string, unknown>>;
    };

    expect(easJson.cli).toMatchObject({
      version: ">= 16.13.0",
      appVersionSource: "local",
    });
    expect(easJson.build?.development).toMatchObject({
      developmentClient: true,
      distribution: "internal",
    });
    expect(easJson.build?.preview).toMatchObject({
      distribution: "internal",
    });
    expect(easJson.build?.production).toMatchObject({
      autoIncrement: true,
    });
    expect(easJson.submit?.production).toEqual({});
  });
});
