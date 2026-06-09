import { useEffect, useMemo, useState } from "react";
import "./App.css";

const STORAGE_KEY = "staff-guard-map-shift-table-v15";

const DISPLAY_DAYS = 14;
const MIN_DAY_COUNT = 2;
const MIN_NIGHT_COUNT = 2;
const DEFAULT_BUFFER_COUNT = 1;

const SHIFT_TYPES = {
  day: {
    label: "日勤",
    shortLabel: "日",
    count: 1,
    next: "night"
  },
  night: {
    label: "夜勤",
    shortLabel: "夜",
    count: 1,
    next: "buffer"
  },
  buffer: {
    label: "バッファー",
    shortLabel: "候",
    count: 0.5,
    next: "off"
  },
  off: {
    label: "休み",
    shortLabel: "休",
    count: 0,
    next: "day"
  }
};

const INITIAL_STAFF = [
  { id: "staff-01", name: "スタッフ01" },
  { id: "staff-02", name: "スタッフ02" },
  { id: "staff-03", name: "スタッフ03" },
  { id: "staff-04", name: "スタッフ04" },
  { id: "staff-05", name: "スタッフ05" },
  { id: "staff-06", name: "スタッフ06" },
  { id: "staff-07", name: "スタッフ07" },
  { id: "staff-08", name: "スタッフ08" },
  { id: "staff-09", name: "スタッフ09" },
  { id: "staff-10", name: "スタッフ10" }
];

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function getToday() {
  return toDateString(new Date());
}

function addDays(baseDateString, amount) {
  const date = new Date(`${baseDateString}T00:00:00`);
  date.setDate(date.getDate() + amount);
  return toDateString(date);
}

function formatDateLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const month = date.getMonth() + 1;
  const day = date.getDate();

  return `${month}/${day}`;
}

function formatWeekLabel(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
}

function isWeekend(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay();
  return day === 0 || day === 6;
}

function isWorkShift(shiftType) {
  return shiftType === "day" || shiftType === "night";
}

function isRestrictedAfterFiveWorkdaysShift(shiftType) {
  return shiftType === "day" || shiftType === "night" || shiftType === "buffer";
}

function getShiftForDate(dateKey, staffId, assignments) {
  return assignments[dateKey]?.[staffId] || "off";
}

function getConsecutiveWorkDaysBefore(dateKey, staffId, assignments) {
  let count = 0;

  for (let offset = 1; offset <= 5; offset += 1) {
    const targetDate = addDays(dateKey, -offset);
    const shiftType = getShiftForDate(targetDate, staffId, assignments);

    if (!isWorkShift(shiftType)) {
      break;
    }

    count += 1;
  }

  return count;
}

function validateShiftAssignment(dateKey, staffId, nextShiftType, assignments) {
  const previousDate = addDays(dateKey, -1);
  const previousShift = getShiftForDate(previousDate, staffId, assignments);

  const consecutiveWorkDays = getConsecutiveWorkDaysBefore(
    dateKey,
    staffId,
    assignments
  );

  if (previousShift === "night" && nextShiftType === "day") {
    return {
      ok: false,
      message: "夜勤の翌日は日勤にできません。"
    };
  }

  if (
    consecutiveWorkDays >= 5 &&
    isRestrictedAfterFiveWorkdaysShift(nextShiftType)
  ) {
    return {
      ok: false,
      message: "5連勤後のため、日勤・夜勤・バッファー候補にはできません。"
    };
  }

  return {
    ok: true,
    message: ""
  };
}

function getStaffTotalAssigned(staffId, assignments) {
  return Object.values(assignments).reduce((total, dayAssignments) => {
    const shiftType = dayAssignments?.[staffId] || "off";
    return shiftType === "off" ? total : total + 1;
  }, 0);
}

function getStaffTotalWorkDays(staffId, assignments) {
  return Object.values(assignments).reduce((total, dayAssignments) => {
    const shiftType = dayAssignments?.[staffId] || "off";
    return isWorkShift(shiftType) ? total + 1 : total;
  }, 0);
}

function chooseDefaultStaffForShift({
  dateKey,
  dayIndex,
  shiftType,
  count,
  assignments,
  staffList,
  assignedStaffIds
}) {
  return staffList
    .map((staff, staffIndex) => ({
      staff,
      staffIndex,
      consecutiveWorkDays: getConsecutiveWorkDaysBefore(
        dateKey,
        staff.id,
        assignments
      ),
      totalWorkDays: getStaffTotalWorkDays(staff.id, assignments),
      totalAssignedDays: getStaffTotalAssigned(staff.id, assignments)
    }))
    .filter(({ staff }) => {
      if (assignedStaffIds.has(staff.id)) {
        return false;
      }

      return validateShiftAssignment(
        dateKey,
        staff.id,
        shiftType,
        assignments
      ).ok;
    })
    .sort((a, b) => {
      if (a.consecutiveWorkDays !== b.consecutiveWorkDays) {
        return a.consecutiveWorkDays - b.consecutiveWorkDays;
      }

      if (a.totalWorkDays !== b.totalWorkDays) {
        return a.totalWorkDays - b.totalWorkDays;
      }

      if (a.totalAssignedDays !== b.totalAssignedDays) {
        return a.totalAssignedDays - b.totalAssignedDays;
      }

      const aRotation = (a.staffIndex - dayIndex + staffList.length) % staffList.length;
      const bRotation = (b.staffIndex - dayIndex + staffList.length) % staffList.length;

      return aRotation - bRotation;
    })
    .slice(0, count)
    .map(({ staff }) => staff);
}

function createDefaultAssignments(startDate, staffList) {
  const assignments = {};

  for (let dayIndex = 0; dayIndex < DISPLAY_DAYS; dayIndex += 1) {
    const dateKey = addDays(startDate, dayIndex);
    const assignedStaffIds = new Set();

    assignments[dateKey] = {};

    staffList.forEach((staff) => {
      assignments[dateKey][staff.id] = "off";
    });

    const shiftPlan = [
      { shiftType: "day", count: MIN_DAY_COUNT },
      { shiftType: "night", count: MIN_NIGHT_COUNT },
      { shiftType: "buffer", count: DEFAULT_BUFFER_COUNT }
    ];

    shiftPlan.forEach(({ shiftType, count }) => {
      const pickedStaff = chooseDefaultStaffForShift({
        dateKey,
        dayIndex,
        shiftType,
        count,
        assignments,
        staffList,
        assignedStaffIds
      });

      pickedStaff.forEach((staff) => {
        assignments[dateKey][staff.id] = shiftType;
        assignedStaffIds.add(staff.id);
      });
    });
  }

  return assignments;
}

function getInitialState() {
  const today = getToday();

  return {
    startDate: today,
    activeDate: today,
    staffList: INITIAL_STAFF,
    assignments: createDefaultAssignments(today, INITIAL_STAFF),
    operationMemo:
      "日勤・夜勤はそれぞれ最低2人を下回らないか確認する。夜勤の翌日は日勤にしない。5連勤後は日勤・夜勤・バッファー候補にしない。初期配置も同じ制約判定を通して生成している。バッファーは1人=0.5換算の補填候補枠であり、即時補填や休日呼び出しを保証するものではない。"
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
      startDate: parsed.startDate || fallback.startDate,
      activeDate: parsed.activeDate || parsed.startDate || fallback.activeDate,
      staffList: Array.isArray(parsed.staffList)
        ? parsed.staffList
        : fallback.staffList,
      assignments:
        parsed.assignments && typeof parsed.assignments === "object"
          ? parsed.assignments
          : fallback.assignments,
      operationMemo:
        typeof parsed.operationMemo === "string"
          ? parsed.operationMemo
          : fallback.operationMemo
    };
  } catch {
    return getInitialState();
  }
}

function getDayCounts(dateKey, assignments, staffList) {
  const dayAssignments = assignments[dateKey] || {};

  return staffList.reduce(
    (acc, staff) => {
      const shiftType = dayAssignments[staff.id] || "off";

      if (shiftType === "day") {
        acc.dayPeople += 1;
      }

      if (shiftType === "night") {
        acc.nightPeople += 1;
      }

      if (shiftType === "buffer") {
        acc.bufferPeople += 1;
        acc.bufferCount += SHIFT_TYPES.buffer.count;
      }

      if (shiftType === "off") {
        acc.offPeople += 1;
      }

      return acc;
    },
    {
      dayPeople: 0,
      nightPeople: 0,
      bufferPeople: 0,
      offPeople: 0,
      bufferCount: 0
    }
  );
}

function getDayStatus(dayCounts) {
  const dayShortage = Math.max(MIN_DAY_COUNT - dayCounts.dayPeople, 0);
  const nightShortage = Math.max(MIN_NIGHT_COUNT - dayCounts.nightPeople, 0);
  const rawShortage = dayShortage + nightShortage;
  const adjustedShortage = Math.max(rawShortage - dayCounts.bufferCount, 0);

  const alerts = [];

  if (dayCounts.dayPeople < MIN_DAY_COUNT) {
    alerts.push(
      `日勤が最低人員を下回っています（${dayCounts.dayPeople}/${MIN_DAY_COUNT}人）`
    );
  }

  if (dayCounts.nightPeople < MIN_NIGHT_COUNT) {
    alerts.push(
      `夜勤が最低人員を下回っています（${dayCounts.nightPeople}/${MIN_NIGHT_COUNT}人）`
    );
  }

  if (rawShortage > 0 && dayCounts.bufferCount > 0) {
    alerts.push(
      `バッファー候補 ${dayCounts.bufferCount.toFixed(
        1
      )} 人分の確認が必要です`
    );
  }

  if (rawShortage <= 0) {
    return {
      level: "normal",
      label: "通常",
      message: "日勤・夜勤ともに最低人員を満たしています。",
      dayShortage,
      nightShortage,
      rawShortage,
      adjustedShortage,
      alerts
    };
  }

  if (adjustedShortage <= 0) {
    return {
      level: "warning",
      label: "注意",
      message: "最低人員割れがあります。バッファー候補の確認が必要です。",
      dayShortage,
      nightShortage,
      rawShortage,
      adjustedShortage,
      alerts
    };
  }

  return {
    level: "danger",
    label: "不足",
    message:
      "バッファー候補を含めても不足見込みがあります。上長・営業側への相談が必要です。",
    dayShortage,
    nightShortage,
    rawShortage,
    adjustedShortage,
    alerts
  };
}

function ensureDisplayAssignments(currentAssignments, displayDates, staffList) {
  const defaultAssignments = createDefaultAssignments(displayDates[0], staffList);
  const next = { ...currentAssignments };

  displayDates.forEach((dateKey) => {
    if (!next[dateKey]) {
      next[dateKey] = {};
    }

    const nextDayAssignments = { ...next[dateKey] };

    staffList.forEach((staff) => {
      if (!nextDayAssignments[staff.id]) {
        nextDayAssignments[staff.id] =
          defaultAssignments[dateKey]?.[staff.id] || "off";
      }
    });

    next[dateKey] = nextDayAssignments;
  });

  return next;
}

function App() {
  const initialState = useMemo(() => loadSavedState(), []);

  const [startDate, setStartDate] = useState(initialState.startDate);
  const [activeDate, setActiveDate] = useState(initialState.activeDate);
  const [staffList, setStaffList] = useState(initialState.staffList);
  const [assignments, setAssignments] = useState(initialState.assignments);
  const [operationMemo, setOperationMemo] = useState(initialState.operationMemo);
  const [draggingCell, setDraggingCell] = useState(null);

  const displayDates = useMemo(() => {
    return Array.from({ length: DISPLAY_DAYS }, (_, index) =>
      addDays(startDate, index)
    );
  }, [startDate]);

  const selectedDate = displayDates.includes(activeDate)
    ? activeDate
    : displayDates[0];

  const visibleAssignments = useMemo(() => {
    return ensureDisplayAssignments(assignments, displayDates, staffList);
  }, [assignments, displayDates, staffList]);

  useEffect(() => {
    const saveData = {
      startDate,
      activeDate: selectedDate,
      staffList,
      assignments: visibleAssignments,
      operationMemo
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  }, [startDate, selectedDate, staffList, visibleAssignments, operationMemo]);

  const activeCounts = getDayCounts(selectedDate, visibleAssignments, staffList);
  const activeStatus = getDayStatus(activeCounts);

  const handleMovePeriod = (amount) => {
    const nextStartDate = addDays(startDate, amount * DISPLAY_DAYS);
    setStartDate(nextStartDate);
    setActiveDate(nextStartDate);
  };

  const handleChangeShift = (dateKey, staffId, nextShiftType) => {
    setAssignments((current) => ({
      ...current,
      [dateKey]: {
        ...(current[dateKey] || {}),
        [staffId]: nextShiftType
      }
    }));
  };

  const handleCellClick = (dateKey, staffId) => {
    const currentShift = visibleAssignments[dateKey]?.[staffId] || "off";
    let nextShift = SHIFT_TYPES[currentShift].next;

    const shiftCheck = validateShiftAssignment(
      dateKey,
      staffId,
      nextShift,
      visibleAssignments
    );

    if (!shiftCheck.ok) {
      window.alert(shiftCheck.message);
      nextShift = "off";
    }

    handleChangeShift(dateKey, staffId, nextShift);
    setActiveDate(dateKey);
  };

  const handleDragStart = (event, dateKey, staffId) => {
    const shiftType = visibleAssignments[dateKey]?.[staffId] || "off";

    const payload = {
      fromDate: dateKey,
      staffId,
      shiftType
    };

    setDraggingCell(payload);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (event, targetDate, targetStaffId) => {
    event.preventDefault();

    let payload = draggingCell;

    try {
      const data = event.dataTransfer.getData("application/json");
      if (data) {
        payload = JSON.parse(data);
      }
    } catch {
      payload = draggingCell;
    }

    if (!payload) {
      return;
    }

    const targetShift = payload.shiftType;

    setAssignments((current) => {
      const next = ensureDisplayAssignments(current, displayDates, staffList);

      const shiftCheck = validateShiftAssignment(
        targetDate,
        targetStaffId,
        targetShift,
        next
      );

      if (!shiftCheck.ok) {
        window.alert(shiftCheck.message);
        return next;
      }

      next[payload.fromDate] = {
        ...next[payload.fromDate],
        [payload.staffId]: "off"
      };

      next[targetDate] = {
        ...next[targetDate],
        [targetStaffId]: targetShift
      };

      return next;
    });

    setActiveDate(targetDate);
    setDraggingCell(null);
  };

  const handleResetPeriod = () => {
    const ok = window.confirm("表示中の2週間のシフトを初期配置に戻します。");

    if (!ok) {
      return;
    }

    setAssignments((current) => {
      const next = { ...current };
      const resetAssignments = createDefaultAssignments(startDate, staffList);

      displayDates.forEach((dateKey) => {
        next[dateKey] = resetAssignments[dateKey];
      });

      return next;
    });
  };

  const handleResetAll = () => {
    const ok = window.confirm("保存データをすべて初期化します。");

    if (!ok) {
      return;
    }

    const resetState = getInitialState();

    setStartDate(resetState.startDate);
    setActiveDate(resetState.activeDate);
    setStaffList(resetState.staffList);
    setAssignments(resetState.assignments);
    setOperationMemo(resetState.operationMemo);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(resetState));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="app-kicker">シフト制・体制維持表</p>
        <h1>Staff Guard Map</h1>
        <p className="app-lead">
          欠員時の体制維持と、バッファー人員の考え方を整理するための検討用プロトタイプです。
        </p>
      </header>

      <section className="control-card">
        <div className="control-grid">
          <label className="control-field">
            <span>表示開始日</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setActiveDate(event.target.value);
              }}
            />
          </label>

          <div className="minimum-note">
            <span>表示期間 / 最低人員</span>
            <strong>2週間 / 日勤2人・夜勤2人</strong>
          </div>

          <div className="week-actions">
            <button type="button" onClick={() => handleMovePeriod(-1)}>
              前の2週間
            </button>
            <button type="button" onClick={() => handleMovePeriod(1)}>
              次の2週間
            </button>
            <button type="button" onClick={handleResetPeriod}>
              2週間初期化
            </button>
          </div>
        </div>
      </section>

      <section className="active-summary">
        <article className={`summary-main summary-main--${activeStatus.level}`}>
          <span>選択日</span>
          <strong>
            {formatDateLabel(selectedDate)}({formatWeekLabel(selectedDate)})
          </strong>
          <p>{activeStatus.message}</p>

          {activeStatus.alerts.length > 0 && (
            <div className="shift-alert-list">
              {activeStatus.alerts.map((alertText) => (
                <div key={alertText} className="shift-alert">
                  {alertText}
                </div>
              ))}
            </div>
          )}
        </article>

        <article>
          <span>日勤</span>
          <strong>
            {activeCounts.dayPeople}/{MIN_DAY_COUNT}
          </strong>
        </article>

        <article>
          <span>夜勤</span>
          <strong>
            {activeCounts.nightPeople}/{MIN_NIGHT_COUNT}
          </strong>
        </article>

        <article>
          <span>候補</span>
          <strong>{activeCounts.bufferCount.toFixed(1)}</strong>
        </article>

        <article>
          <span>休み</span>
          <strong>{activeCounts.offPeople}</strong>
        </article>

        <article className={`summary-shortage summary-shortage--${activeStatus.level}`}>
          <span>不足見込み</span>
          <strong>{activeStatus.adjustedShortage.toFixed(1)}</strong>
        </article>
      </section>

      <section className="shift-table-card">
        <div className="table-heading">
          <div>
            <h2>2週間シフト表</h2>
            <p>
              横にスライドできます。セルをタップすると「休 → 日 → 夜 → 候 → 休」で切り替わります。
            </p>
          </div>

          <div className="legend">
            <span className="legend-item legend-item--day">日勤 1人</span>
            <span className="legend-item legend-item--night">夜勤 1人</span>
            <span className="legend-item legend-item--buffer">候補 0.5人</span>
            <span className="legend-item legend-item--off">休み 0人</span>
          </div>
        </div>

        <div className="shift-table-wrap">
          <table className="shift-table">
            <thead>
              <tr>
                <th className="staff-head">スタッフ</th>
                {displayDates.map((dateKey) => {
                  const dayCounts = getDayCounts(
                    dateKey,
                    visibleAssignments,
                    staffList
                  );
                  const dayStatus = getDayStatus(dayCounts);

                  return (
                    <th
                      key={dateKey}
                      className={`date-head ${
                        selectedDate === dateKey ? "date-head--active" : ""
                      } ${isWeekend(dateKey) ? "date-head--weekend" : ""}`}
                      onClick={() => setActiveDate(dateKey)}
                    >
                      <span>{formatDateLabel(dateKey)}</span>
                      <small>{formatWeekLabel(dateKey)}</small>
                      <b className={`mini-status mini-status--${dayStatus.level}`}>
                        {dayStatus.label}
                      </b>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {staffList.map((staff) => (
                <tr key={staff.id}>
                  <th className="staff-name">
                    <strong>{staff.name}</strong>
                  </th>

                  {displayDates.map((dateKey) => {
                    const shiftType =
                      visibleAssignments[dateKey]?.[staff.id] || "off";
                    const shift = SHIFT_TYPES[shiftType];

                    return (
                      <td
                        key={`${dateKey}-${staff.id}`}
                        className={`shift-cell ${
                          selectedDate === dateKey ? "shift-cell--active-date" : ""
                        }`}
                        onDragOver={handleDragOver}
                        onDrop={(event) => handleDrop(event, dateKey, staff.id)}
                      >
                        <button
                          type="button"
                          className={`shift-pill shift-pill--${shiftType}`}
                          draggable
                          onClick={() => handleCellClick(dateKey, staff.id)}
                          onDragStart={(event) =>
                            handleDragStart(event, dateKey, staff.id)
                          }
                          onDragEnd={() => setDraggingCell(null)}
                        >
                          <span>{shift.shortLabel}</span>
                          <small>{shift.count.toFixed(1)}</small>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <th className="staff-name staff-name--total">日別集計</th>

                {displayDates.map((dateKey) => {
                  const dayCounts = getDayCounts(
                    dateKey,
                    visibleAssignments,
                    staffList
                  );
                  const dayStatus = getDayStatus(dayCounts);

                  return (
                    <td
                      key={`total-${dateKey}`}
                      className={`day-total day-total--${dayStatus.level}`}
                      onClick={() => setActiveDate(dateKey)}
                    >
                      <span>
                        日 {dayCounts.dayPeople}/{MIN_DAY_COUNT}
                      </span>
                      <span>
                        夜 {dayCounts.nightPeople}/{MIN_NIGHT_COUNT}
                      </span>
                      <span>候 {dayCounts.bufferCount.toFixed(1)}</span>
                      <strong>不足 {dayStatus.adjustedShortage.toFixed(1)}</strong>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="bottom-grid">
        <section className="info-card">
          <h2>運用メモ</h2>
          <textarea
            className="memo-textarea"
            value={operationMemo}
            onChange={(event) => setOperationMemo(event.target.value)}
            rows="7"
          />
        </section>

        <section className="info-card">
          <h2>この画面の扱い</h2>
          <p className="note-text">
            日勤・夜勤は1人、バッファーは0.5人、休みは0人として扱います。
          </p>
          <p className="note-text">
            初期配置は、夜勤明け日勤禁止・5連勤後の勤務禁止ルールを通して生成しています。
          </p>
          <p className="note-text">
            夜勤の翌日は、日勤にできません。
          </p>
          <p className="note-text">
            5連勤後は、日勤・夜勤・バッファー候補にできません。
          </p>
          <p className="note-text">
            日勤・夜勤はそれぞれ2人未満の場合にアラートを表示します。
          </p>
          <p className="note-text">
            バッファーは、即時補填や休日呼び出しを保証するものではありません。
            欠員時の補填候補として事前に整理するための枠です。
          </p>
          <p className="note-text">
            具体的な勤務時刻は、実運用・勤怠・契約に関わるため、このプロトタイプでは固定しません。
          </p>
          <p className="note-text">
            実際の勤怠・契約・待機扱い・顧客報告は、
            上長・営業・管理側との確認が必要です。
          </p>

          <button type="button" className="danger-button" onClick={handleResetAll}>
            保存データを全初期化
          </button>
        </section>
      </section>
    </main>
  );
}

export default App;