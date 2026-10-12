import type React from 'react';

/** What the site's frame hands each page: its download and install buttons, and the latest release. */
export interface LandingActions {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  devStudio?: React.ReactNode;
  releaseTag: string | null;
  fileLabel: string;
}
