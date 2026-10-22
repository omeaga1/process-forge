import type React from 'react';

/** What the site's frame hands the front page: its one download button, and the latest release. */
export interface LandingActions {
  primary: React.ReactNode;
  devStudio?: React.ReactNode;
  releaseTag: string | null;
  fileLabel: string;
}
