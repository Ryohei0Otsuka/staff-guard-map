import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GripVertical,
  Plus,
  ShieldCheck,
  Trash2,
  Users
} from "lucide-react";
import "./App.css";

const STORAGE_KEY = "staff-guard-map-v1";

const GROUPS = {
  working: {
    label: "出勤",
    shortLabel: "出勤",
    count: 1,
    description: "通常稼働できる人員",
    tone: "working"
  },
  off: {
    label: "休日",
    shortLabel: "休日",
    count: 0,
    description: "稼働前提にしない人員",
    tone: "off"
  },
  buffer: {
    label: "補填候補",
    shortLabel: "候補",
    count: 0.5,
    description: "欠員時に調整可能性を持つ候補枠",
    tone: "buffer"
  }
};

const INITIAL_STAFF = [
  {
    id: crypto.randomUUID(),
    name: "スタッフA",
    group: "working",
    memo: "通常業務対応可"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフB",
    group: "working",
    memo: "監視・一次対応"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフC",
    group: "working",
    memo: "手順確認済み"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフD",
    group: "working",
    memo: "引き継ぎ対応"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフE",
    group: "working",
    memo: "通常稼働"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフF",
    group: "buffer",
    memo: "補填候補・要確認"
  },
  {
    id: crypto.randomUUID(),
    name: "スタッフG",
    group: "off",
    memo: "休日"
  }
];

const KNOWLEDGE_ITEMS = [
  "通常業務の手順",
  "作業の目的",
  "作業完了条件",
  "よくあるミス",
  "イレギュラー条件",
  "自己判断してよい範囲",
  "エスカレーション先",
  "欠員時に優先して守る業務",
  "次シフトへの引き継ぎ項目",
  "顧客報告が必要になる条件"
];

const INITIAL_CHECKED_KNOWLEDGE = [
  "通常業務の手順",
  "作業の目的",
  "エスカレーション先"
];

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getInitialState() {
  return {
    targetDate: getToday(),
    shiftName: "日勤",
    requiredCount: 5,
    staffList: INITIAL_STAFF,
    checkedKnowledge: INITIAL_CHECKED_KNOWLEDGE
  };
}

function loadSavedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return getInitialState();
    }

    const parsed = JSON.parse(saved);
    const fallback = getInitialState();

    return {
      targetDate: parsed.targetDate || fallback.targetDate,
      shiftName: parsed.shiftName || fallback.shiftName,
      requiredCount:
        typeof parsed.requiredCount === "number"
          ? parsed.requiredCount
          : fallback.requiredCount,
      staffList: Array.isArray(parsed.staffList) ? parsed.staffList : fallback.staffList,
      checkedKnowledge: Array.isArray(parsed.checkedKnowledge)
        ? parsed.checkedKnowledge
        : fallback.checkedKnowledge
    };
  } catch {
    return getInitialState();
  }
}

function getStatus(requiredCount, workingCount, bufferCount) {
  const workingShortage = Math.max(requiredCount - workingCount, 0);
  const expectedShortage = Math.max(requiredCount - workingCount - bufferCount, 0);

  if (workingShortage <= 0) {
    return {
      label: "通常",
      level: "normal",
      message: "必要人員を満たしています。"
    };
  }

  if (expectedShortage <= 0) {
    return {
      label: "注意",
      level: "warning",
      message: "出勤人員は不足しています。補填候補枠の確認が必要です。"
    };
  }

  return {
    label: "不足",
    level: "danger",
    message: "補填候補枠を含めても不足見込みがあります。上長・営業側への相談が必要です。"
  };
}

function App() {
  const initialState = useMemo(() => loadSavedState(), []);

  const [targetDate, setTargetDate] = useState(initialState.targetDate);
  const [shiftName, setShiftName] = useState(initialState.shiftName);
  const [requiredCount, setRequiredCount] = useState(initialState.requiredCount);
  const [staffList, setStaffList] = useState(initialState.staffList);
  const [newStaffName, setNewStaffName] = useState("");
  const [draggingId, setDraggingId] = useState(null);
  const [checkedKnowledge, setCheckedKnowledge] = useState(
    initialState.checkedKnowledge
  );

  useEffect(() => {
    const saveData = {
      targetDate,
      shiftName,
      requiredCount,
      staffList,
      checkedKnowledge
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  }, [targetDate, shiftName, requiredCount, staffList, checkedKnowledge]);

  const groupedStaff = useMemo(() => {
    return Object.keys(GROUPS).reduce((acc, groupKey) => {
      acc[groupKey] = staffList.filter((staff) => staff.group === groupKey);
      return acc;
    }, {});
  }, [staffList]);

  const counts = useMemo(() => {
    const workingCount = groupedStaff.working.length * GROUPS.working.count;
    const offCount = groupedStaff.off.length * GROUPS.off.count;
    const bufferCount = groupedStaff.buffer.length * GROUPS.buffer.count;
    const workingShortage = Math.max(requiredCount - workingCount, 0);
    const expectedShortage = Math.max(requiredCount - workingCount - bufferCount, 0);

    return {
      workingCount,
      offCount,
      bufferCount,
      workingShortage,
      expectedShortage
    };
  }, [groupedStaff, requiredCount]);

  const status = getStatus(requiredCount, counts.workingCount, counts.bufferCount);

  const knowledgeRate = Math.round(
    (checkedKnowledge.length / KNOWLEDGE_ITEMS.length) * 100
  );

  const handleDragStart = (event, staffId) => {
    setDraggingId(staffId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", staffId);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event, targetGroup) => {
    event.preventDefault();

    const staffId = event.dataTransfer.getData("text/plain") || draggingId;

    if (!staffId) {
      return;
    }

    setStaffList((current) =>
      current.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              group: targetGroup
            }
          : staff
      )
    );

    setDraggingId(null);
  };

  const handleAddStaff = () => {
    const trimmedName = newStaffName.trim();

    if (!trimmedName) {
      return;
    }

    setStaffList((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        group: "off",
        memo: "未設定"
      }
    ]);

    setNewStaffName("");
  };

  const handleDeleteStaff = (staffId) => {
    setStaffList((current) => current.filter((staff) => staff.id !== staffId));
  };

  const handleUpdateMemo = (staffId, memo) => {
    setStaffList((current) =>
      current.map((staff) =>
        staff.id === staffId
          ? {
              ...staff,
              memo
            }
          : staff
      )
    );
  };

  const handleToggleKnowledge = (item) => {
    setCheckedKnowledge((current) =>
      current.includes(item)
        ? current.filter((checkedItem) => checkedItem !== item)
        : [...current, item]
    );
  };

  const handleResetData = () => {
    const ok = window.confirm(
      "保存データを初期状態に戻します。現在のスタッフ配置やメモもリセットされます。"
    );

    if (!ok) {
      return;
    }

    const resetState = getInitialState();

    setTargetDate(resetState.targetDate);
    setShiftName(resetState.shiftName);
    setRequiredCount(resetState.requiredCount);
    setStaffList(resetState.staffList);
    setCheckedKnowledge(resetState.checkedKnowledge);
    setNewStaffName("");

    localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState));
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">
            <ShieldCheck size={18} />
            体制ガードマップ
          </div>

          <h1>Staff Guard Map</h1>

          <p>
            欠員時の「人員数」と「業務機能」を分けて確認するための、
            体制維持プロトタイプです。
          </p>
        </div>

        <div className={`status-badge status-badge--${status.level}`}>
          <span>{status.label}</span>
          <small>{status.message}</small>
        </div>
      </section>

      <section className="control-panel">
        <label className="field">
          <span>
            <CalendarDays size={16} />
            対象日
          </span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => setTargetDate(event.target.value)}
          />
        </label>

        <label className="field">
          <span>
            <ClipboardList size={16} />
            対象シフト
          </span>
          <input
            type="text"
            value={shiftName}
            onChange={(event) => setShiftName(event.target.value)}
          />
        </label>

        <label className="field">
          <span>
            <Users size={16} />
            必要人員
          </span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={requiredCount}
            onChange={(event) => setRequiredCount(Number(event.target.value))}
          />
        </label>
      </section>

      <section className="summary-grid" aria-label="体制サマリー">
        <article className="summary-card">
          <span>必要人員</span>
          <strong>{requiredCount.toFixed(1)}</strong>
          <small>契約・体制上の基準</small>
        </article>

        <article className="summary-card">
          <span>出勤カウント</span>
          <strong>{counts.workingCount.toFixed(1)}</strong>
          <small>出勤者 × 1.0</small>
        </article>

        <article className="summary-card">
          <span>補填候補枠</span>
          <strong>{counts.bufferCount.toFixed(1)}</strong>
          <small>候補者 × 0.5</small>
        </article>

        <article className={`summary-card summary-card--${status.level}`}>
          <span>不足見込み</span>
          <strong>{counts.expectedShortage.toFixed(1)}</strong>
          <small>即時補填保証なし</small>
        </article>
      </section>

      <section className="workspace">
        <div className="board-area">
          <div className="section-heading">
            <h2>スタッフ配置</h2>
            <p>カードをドラッグして、出勤・休日・補填候補へ移動できます。</p>
          </div>

          <div className="add-staff">
            <input
              type="text"
              value={newStaffName}
              onChange={(event) => setNewStaffName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleAddStaff();
                }
              }}
              placeholder="追加するスタッフ名"
            />
            <button type="button" onClick={handleAddStaff}>
              <Plus size={16} />
              追加
            </button>
          </div>

          <div className="staff-board">
            {Object.entries(GROUPS).map(([groupKey, group]) => (
              <section
                key={groupKey}
                className={`staff-column staff-column--${group.tone}`}
                onDragOver={handleDragOver}
                onDrop={(event) => handleDrop(event, groupKey)}
              >
                <header className="column-header">
                  <div>
                    <h3>{group.label}</h3>
                    <p>{group.description}</p>
                  </div>

                  <span className="column-count">
                    {groupedStaff[groupKey].length}名
                  </span>
                </header>

                <div className="staff-list">
                  {groupedStaff[groupKey].map((staff) => (
                    <article
                      key={staff.id}
                      className={`staff-card ${
                        draggingId === staff.id ? "staff-card--dragging" : ""
                      }`}
                      draggable
                      onDragStart={(event) => handleDragStart(event, staff.id)}
                      onDragEnd={() => setDraggingId(null)}
                    >
                      <div className="staff-card__main">
                        <GripVertical className="drag-icon" size={18} />
                        <div>
                          <strong>{staff.name}</strong>
                          <span>{group.shortLabel}</span>
                        </div>
                      </div>

                      <textarea
                        value={staff.memo}
                        onChange={(event) =>
                          handleUpdateMemo(staff.id, event.target.value)
                        }
                        rows="2"
                        aria-label={`${staff.name}のメモ`}
                      />

                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => handleDeleteStaff(staff.id)}
                        aria-label={`${staff.name}を削除`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </article>
                  ))}

                  {groupedStaff[groupKey].length === 0 && (
                    <div className="empty-drop-zone">ここへドラッグ</div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="side-panel">
          <section className="info-card">
            <h2>欠員時チェック</h2>

            <div className="check-row">
              <span>出勤不足</span>
              <strong>{counts.workingShortage.toFixed(1)}</strong>
            </div>

            <div className="check-row">
              <span>補填候補枠</span>
              <strong>{counts.bufferCount.toFixed(1)}</strong>
            </div>

            <div className="check-row">
              <span>不足見込み</span>
              <strong>{counts.expectedShortage.toFixed(1)}</strong>
            </div>

            <div className={`notice notice--${status.level}`}>
              {status.level === "normal" ? (
                <CheckCircle2 size={18} />
              ) : (
                <AlertTriangle size={18} />
              )}
              <p>{status.message}</p>
            </div>
          </section>

          <section className="info-card">
            <h2>ナレッジ共有</h2>

            <div className="knowledge-meter">
              <span style={{ width: `${knowledgeRate}%` }} />
            </div>

            <p className="knowledge-rate">共有率 {knowledgeRate}%</p>

            <div className="knowledge-list">
              {KNOWLEDGE_ITEMS.map((item) => (
                <label key={item} className="knowledge-item">
                  <input
                    type="checkbox"
                    checked={checkedKnowledge.includes(item)}
                    onChange={() => handleToggleKnowledge(item)}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="info-card">
            <h2>保存</h2>
            <p className="small-text">
              入力内容・スタッフ配置・メモ・ナレッジ共有状態は、
              このブラウザに自動保存されます。
            </p>

            <button type="button" className="reset-button" onClick={handleResetData}>
              保存データを初期化
            </button>
          </section>

          <section className="info-card">
            <h2>注意</h2>
            <p className="small-text">
              補填候補枠は、即時補填や休日呼び出しを保証するものではありません。
              実際の勤怠・契約・単価・待機扱い・顧客報告は、
              上長・営業・管理側との確認が必要です。
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}

export default App;