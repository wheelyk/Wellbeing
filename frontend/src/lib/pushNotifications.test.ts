import { describe, it, expect, afterEach } from "vitest";
import { urlBase64ToUint8Array, isPushSupported, waitForActivation } from "./pushNotifications";

describe("urlBase64ToUint8Array", () => {
  it("decodes a padding-free base64url string back to its original bytes", () => {
    // "SGVsbG8=" is standard base64 for "Hello" - base64url strips the trailing "=" padding,
    // which this function has to re-add itself before the browser's own atob() can decode it.
    const result = urlBase64ToUint8Array("SGVsbG8");
    expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]); // "Hello"
  });

  it("converts URL-safe characters (- and _) back to standard base64 (+ and /) before decoding", () => {
    // A byte sequence whose standard-base64 encoding happens to contain "+" and "/" - "\xfb\xff"
    // encodes as "+/8=" in standard base64, and "-_8" in base64url.
    const result = urlBase64ToUint8Array("-_8");
    expect(Array.from(result)).toEqual([251, 255]);
  });
});

describe("isPushSupported", () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  const originalPushManager = (window as { PushManager?: unknown }).PushManager;
  const originalNotification = (window as { Notification?: unknown }).Notification;

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    }
    (window as { PushManager?: unknown }).PushManager = originalPushManager;
    (window as { Notification?: unknown }).Notification = originalNotification;
  });

  it("is true when serviceWorker, PushManager, and Notification are all present", () => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    (window as { PushManager?: unknown }).PushManager = class {};
    (window as { Notification?: unknown }).Notification = class {};

    expect(isPushSupported()).toBe(true);
  });

  it("is false when any one of the three is missing - e.g. iOS Safari without Home Screen install", () => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    (window as { PushManager?: unknown }).PushManager = class {};
    delete (window as { Notification?: unknown }).Notification;

    expect(isPushSupported()).toBe(false);
  });
});

// A minimal stand-in for the real ServiceWorker interface - jsdom has no real service worker
// lifecycle to test against at all, so this simulates just the two things waitForActivation
// actually uses: a `state` string and add/removeEventListener.
class FakeServiceWorker {
  state: string;
  private listeners: Array<() => void> = [];
  // When true, simulates the exact real-world race this function has to defend against: the
  // worker finishes activating in the gap between the caller's own initial state check and this
  // listener actually being attached - the 'statechange' event that transition would have fired
  // already happened and was missed by anyone not yet listening.
  private activateBetweenCheckAndListen: boolean;

  constructor(initialState: string, activateBetweenCheckAndListen = false) {
    this.state = initialState;
    this.activateBetweenCheckAndListen = activateBetweenCheckAndListen;
  }
  addEventListener(_type: string, listener: () => void) {
    this.listeners.push(listener);
    if (this.activateBetweenCheckAndListen) {
      this.state = "activated";
      // Deliberately not calling `listener()` here - a real 'statechange' event that already
      // fired before this listener existed would never reach it either.
    }
  }
  removeEventListener(_type: string, listener: () => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  activate() {
    this.state = "activated";
    this.listeners.forEach((listener) => listener());
  }
}

function fakeRegistration(worker: FakeServiceWorker) {
  return { active: worker } as unknown as ServiceWorkerRegistration;
}

describe("waitForActivation", () => {
  it("resolves immediately if the worker is already activated", async () => {
    const worker = new FakeServiceWorker("activated");
    await expect(waitForActivation(fakeRegistration(worker))).resolves.toBeUndefined();
  });

  it("resolves once the worker's statechange event reports activated", async () => {
    const worker = new FakeServiceWorker("activating");
    const promise = waitForActivation(fakeRegistration(worker));
    worker.activate();
    await expect(promise).resolves.toBeUndefined();
  });

  // Regression test for a real bug: without re-checking the worker's state immediately after
  // attaching the listener, a worker that finishes activating in the gap between the initial
  // check and the listener being attached would hang this function forever - confirmed directly
  // against a real browser during this feature's own manual verification, not a theoretical
  // concern.
  it("resolves even if the worker already finished activating before the listener attached", async () => {
    const worker = new FakeServiceWorker("activating", true);
    await expect(waitForActivation(fakeRegistration(worker))).resolves.toBeUndefined();
  });
});
