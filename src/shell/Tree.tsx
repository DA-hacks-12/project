import styles from "./tree.module.css";

/** The nature block's picture: a flat pine on a hill. */
export function Tree() {
  return (
    <svg
      className={styles.tree}
      viewBox="0 0 160 72"
      role="img"
      aria-label="Tree"
    >
      <path d="M0 72 Q80 44 160 72 Z" className={styles.hill} />
      <rect x="77" y="46" width="6" height="16" className={styles.trunk} />
      <path
        d="M80 8 L96 30 H88 L100 46 H60 L72 30 H64 Z"
        className={styles.leaves}
      />
    </svg>
  );
}
