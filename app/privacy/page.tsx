import type { Metadata } from "next";
import LegalPageLayout, { type LegalSection } from "../../components/qattan/LegalPageLayout";

export const metadata: Metadata = {
  title: "Privacy Policy | Qattan AI",
  description: "How Qattan AI collects, uses, and protects your personal data.",
};

const sections: LegalSection[] = [
  {
    heading: "1. Data We Collect",
    body: [
      "When you sign in with Google, we collect your name, email address, and profile picture. This information is used solely to create and identify your Qattan AI account.",
      "We store your generation history: the images you upload and the renders you generate, together with basic technical metadata (timestamps, tool used, and credit transactions).",
    ],
  },
  {
    heading: "2. How We Use Your Data",
    body: [
      "Your data is used to operate the platform: authenticating your account, maintaining your daily credit balance, storing your generation history, and improving service reliability.",
      "We do NOT sell your personal data to third parties. We do not share it with advertisers, and we do not use it for profiling.",
    ],
  },
  {
    heading: "3. Where Your Data Is Stored",
    body: [
      "All data is stored securely on Supabase infrastructure located in the European Union, protected by row-level security and encrypted connections in transit and at rest.",
    ],
  },
  {
    heading: "4. Data Retention & Deletion",
    body: [
      "Your account data is retained for as long as your account is active. You may request complete deletion of your account and associated data at any time by contacting us — we will process verified requests within 30 days.",
    ],
  },
  {
    heading: "5. Contact",
    body: [
      "For privacy questions or data deletion requests, contact us at yusefelshater979@gmail.com.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      subtitle="How Qattan AI collects, uses, and protects your data."
      effectiveLabel="Effective date: September 2026"
      backLabel="Back to home"
      sections={sections}
    />
  );
}
