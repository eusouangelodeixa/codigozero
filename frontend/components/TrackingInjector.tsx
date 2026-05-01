"use client";
import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function TrackingInjector() {
  useEffect(() => {
    fetch(`${API_URL}/api/landing/config`)
      .then((res) => res.json())
      .then((data) => {
        if (data.config) {
          if (data.config.headScripts) {
            const fragment = document.createRange().createContextualFragment(data.config.headScripts);
            document.head.appendChild(fragment);
          }
          if (data.config.bodyScripts) {
            const fragment = document.createRange().createContextualFragment(data.config.bodyScripts);
            document.body.appendChild(fragment);
          }
        }
      })
      .catch((err) => {
        console.error("Tracking Injector Error:", err);
      });
  }, []);

  return null;
}
