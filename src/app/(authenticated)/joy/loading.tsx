import styles from "./joy-wall-page.module.css";

export default function JoyWallLoading() {
  return <div className="page-stack" aria-busy="true" aria-label="正在載入歡喜牆">
    <header className="page-header"><div><p className="eyebrow">社員交流</p><h1>歡喜牆</h1><p>正在載入社內分享……</p></div></header>
    <div className={styles.skeletonComposer} />
    <div className={styles.skeletonPost} />
    <div className={styles.skeletonPost} />
  </div>;
}
