"use client";

import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";
import AuthGuard from "@/components/AuthGuard";

export default function ChecklistPage() {
  return (
    <AuthGuard>
      <MobileHeader />
      <SideNav active="checklist" />
      <main className="md:ml-64 flex-1 flex flex-col items-center justify-center min-h-screen p-container-padding">
        <h2 className="font-headline-xl text-headline-xl text-on-surface uppercase tracking-tighter">
          Checklist
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2">
          Coming soon.
        </p>
      </main>
    </AuthGuard>
  );
}
