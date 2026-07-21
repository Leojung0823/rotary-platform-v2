const principles = [
  "一個共用平台服務多個扶輪社，社級資料以 club_id 隔離。",
  "club_memberships 只保存真正的扶輪社友。",
  "執行秘書使用個人獨立帳號與社級管理授權，不建立社籍。",
  "同一扶輪社可有多位執行秘書，每位操作都可稽核。",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="space-y-5">
          <p className="text-sm font-semibold tracking-[0.25em] text-sky-300">
            ROTARY PLATFORM V2
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
            多扶輪社共用的管理平台，從乾淨的身份與權限模型開始。
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-slate-300">
            第一個垂直功能將完成「建立扶輪社，並邀請第一位執行秘書」。
            現階段不連接正式 Lovable 資料庫。
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {principles.map((principle) => (
            <article
              key={principle}
              className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
            >
              <p className="leading-7 text-slate-200">{principle}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-emerald-700/50 bg-emerald-950/40 p-6">
          <h2 className="text-xl font-semibold text-emerald-200">目前狀態</h2>
          <p className="mt-2 text-emerald-100/80">
            Next.js 基礎、TypeScript、Tailwind CSS、ESLint 與 Supabase SSR
            client 已建立；等待建立 V2 staging Supabase 專案。
          </p>
        </section>
      </div>
    </main>
  );
}
