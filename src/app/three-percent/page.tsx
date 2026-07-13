"use client";

import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";

function ThreePercentInner() {
  return (
    <>
      <MobileHeader />
      <SideNav active="three-percent" />

      <div className="md:ml-64 flex-1 flex flex-col bg-background min-h-screen">
        <header className="hidden md:flex bg-surface w-full border-b-2 border-on-surface justify-between items-center h-16 px-container-padding sticky top-0 z-30">
          <div className="font-headline-md text-headline-md text-on-surface uppercase border-b-2 border-on-surface pb-1">
            3% Club
          </div>
        </header>

        <main className="flex-1 p-4 md:p-stack-lg flex flex-col items-center justify-center text-center">
          <div className="bg-surface border-2 border-on-surface p-8 max-w-md w-full shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <span className="material-symbols-outlined text-6xl text-primary mb-4">
              percent
            </span>
            <h2 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight mb-2">
              3% Club
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant uppercase tracking-wide">
              Future system integration
            </p>
            <div className="border-t-2 border-on-surface my-4"></div>
            <p className="font-data-mono text-data-mono text-xs text-on-surface-variant uppercase">
              Under Development &bull; Access Restricted
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

export default function ThreePercentPage() {
  return (
    <AuthGuard>
      <ThreePercentInner />
    </AuthGuard>
  );
}
