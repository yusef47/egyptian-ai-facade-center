import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { qattanLocaleHref } from "./QattanProviders";
import type { QattanLocale } from "./qattan-content";

type LocaleLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  locale: QattanLocale;
  href: string;
  children: ReactNode;
};

export function LocaleLink({ locale, href, children, ...props }: LocaleLinkProps) {
  const linkHref = qattanLocaleHref(locale, href) as LinkProps["href"];
  return <Link href={linkHref} {...props}>{children}</Link>;
}
