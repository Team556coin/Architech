"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { isNative, pickNativePhoto } from "@/lib/native";
import { useToast } from "./Providers";

export interface PhotoPickerHandle {
  camera: () => void;
  gallery: () => void;
}

/** Hidden inputs (web) or the native camera and gallery (Android app). */
export const PhotoPicker = forwardRef<PhotoPickerHandle, { onPick: (file: Blob & { name?: string }) => void }>(function PhotoPicker({ onPick }, ref) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const native = async (source: "camera" | "gallery") => {
    try {
      const blob = await pickNativePhoto(source);
      if (blob) onPick(blob);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (/denied|permission/i.test(msg)) toast("HomeRedo needs permission to use your camera and photos. You can turn it on in Settings.", "error");
      else toast("Couldn't open the camera. Try choosing a photo instead.", "error");
    }
  };

  useImperativeHandle(ref, () => ({
    camera: () => (isNative() ? void native("camera") : cameraInput.current?.click()),
    gallery: () => (isNative() ? void native("gallery") : galleryInput.current?.click()),
  }));

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) onPick(f);
  };

  return (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onChange} data-testid="camera-input" />
      <input ref={galleryInput} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={onChange} data-testid="photo-input" />
    </>
  );
});
