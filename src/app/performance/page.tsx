import MobileHeader from "@/components/MobileHeader";
import SideNav from "@/components/SideNav";

const metrics = [
  { label: "Overall Score", value: "72%", color: "text-primary-container" },
  { label: "Tasks Done", value: "15", color: "text-on-surface" },
  { label: "Late Items", value: "4", color: "text-on-surface", icon: "schedule" },
];

const leaderboard = [
  { rank: "01", name: "Samir", dept: "Engineering", score: "100%", top: true },
  { rank: "02", name: "Priya", dept: "Design", score: "63%" },
  { rank: "03", name: "Shikha", dept: "Operations", score: "50%" },
  { rank: "04", name: "Deepak", dept: "Sales", score: "22%", muted: true },
];

export default function PerformancePage() {
  return (
    <>
      <MobileHeader />
      <SideNav active="dashboard" />

      <main className="flex-1 md:ml-64 p-4 md:p-container-padding flex flex-col gap-6 md:gap-stack-lg max-w-[1440px] mx-auto w-full">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-on-surface pb-4">
          <div>
            <h2 className="font-headline-xl text-headline-xl text-on-surface">
              Performance Scorecard
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-2xl">
              Enterprise resource utilization and individual contributor metrics for
              current operational cycle.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-primary-container text-on-primary font-label-sm text-label-sm uppercase">
              Status: Active
            </span>
            <span className="px-3 py-1 bg-[#000000] text-on-primary font-label-sm text-label-sm uppercase">
              Q3 Cycle
            </span>
          </div>
        </header>

        {/* Key Metrics Bento Grid */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-gutter">
          {metrics.map((m) => (
            <div
              key={m.label}
              className="bg-surface-container-lowest swiss-border flex flex-col justify-between p-6 h-40"
            >
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase flex items-center gap-2">
                {m.label}
                {m.icon && (
                  <span className="material-symbols-outlined text-[16px] text-[#000000]">
                    {m.icon}
                  </span>
                )}
              </div>
              <div
                className={`font-headline-xl text-headline-xl data-mono tracking-tighter ${m.color}`}
              >
                {m.value}
              </div>
            </div>
          ))}

          {/* Red Flags */}
          <div className="bg-surface-container-lowest swiss-border flex flex-col justify-between p-6 h-40 relative overflow-hidden group hover:bg-[#F5F5F5] transition-colors cursor-pointer">
            <div className="font-label-sm text-label-sm text-error uppercase flex items-center gap-2">
              Red Flags
              <span className="material-symbols-outlined text-[16px]" data-weight="fill">
                warning
              </span>
            </div>
            <div className="font-headline-xl text-headline-xl text-error data-mono tracking-tighter relative z-10">
              2
            </div>
            <div
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg, #ba1a1a 0, #ba1a1a 2px, transparent 2px, transparent 10px)",
              }}
            />
          </div>
        </section>

        {/* Leaderboard Section */}
        <section className="mt-4">
          <div className="flex items-center justify-between border-b-2 border-on-surface pb-2 mb-4">
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase">
              Contributor Leaderboard
            </h3>
            <button className="font-label-sm text-label-sm border-2 border-[#000000] px-3 py-1 hover:bg-[#000000] hover:text-white transition-colors uppercase">
              Export CSV
            </button>
          </div>

          <div className="w-full overflow-x-auto bg-surface-container-lowest swiss-border">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F5F5F5] swiss-border-b">
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant w-16">
                    Rank
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant">
                    Doer
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant hidden md:table-cell">
                    Department
                  </th>
                  <th className="py-3 px-4 font-label-sm text-label-sm uppercase text-on-surface-variant text-right">
                    Score
                  </th>
                </tr>
              </thead>
              <tbody className="font-body-md text-body-md text-on-surface">
                {leaderboard.map((row) => (
                  <tr
                    key={row.rank}
                    className="swiss-divider last:border-b-0 hover:bg-[#F5F5F5] transition-colors group"
                  >
                    <td
                      className={`py-4 px-4 font-headline-md text-headline-md data-mono ${
                        row.top ? "font-black" : "font-bold text-on-surface-variant"
                      } ${row.muted ? "opacity-50" : ""}`}
                    >
                      {row.rank}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 flex items-center justify-center font-headline-md text-headline-md uppercase ${
                            row.top
                              ? "bg-[#000000] text-white"
                              : row.muted
                              ? "border-2 border-[#000000] text-on-surface bg-surface-container-lowest"
                              : "bg-surface-variant text-on-surface"
                          }`}
                        >
                          {row.name.charAt(0)}
                        </div>
                        <div
                          className={`font-headline-md text-headline-md text-base ${
                            row.muted ? "opacity-70" : ""
                          }`}
                        >
                          {row.name}
                        </div>
                      </div>
                    </td>
                    <td
                      className={`py-4 px-4 hidden md:table-cell font-label-sm text-label-sm text-on-surface-variant ${
                        row.muted ? "opacity-70" : ""
                      }`}
                    >
                      {row.dept}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {row.top ? (
                        <span className="font-headline-md text-headline-md font-bold data-mono bg-primary-container text-on-primary px-2 py-1">
                          {row.score}
                        </span>
                      ) : (
                        <span
                          className={`font-headline-md text-headline-md font-bold data-mono ${
                            row.muted ? "text-error" : ""
                          }`}
                        >
                          {row.score}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
