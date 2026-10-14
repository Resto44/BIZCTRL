/**
 * Payroll calculation engine
 * Computes attendance summary, deductions, bonuses, advances → final salary
 */

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function employeeKey(employee = {}) {
  // The database foreign key is employees.id (UUID); employee_id is a human-readable code.
  return employee.id ?? '';
}

export function calcHours(checkIn, checkOut) {
  const timePattern = /^([01]\\d|2[0-3]):([0-5]\\d)(?::[0-5]\\d)?$/;
  if (typeof checkIn !== 'string' || typeof checkOut !== 'string') return 0;
  const start = checkIn.match(timePattern);
  const end = checkOut.match(timePattern);
  if (!start || !end) return 0;
  const startMinutes = Number(start[1]) * 60 + Number(start[2]);
  const endMinutes = Number(end[1]) * 60 + Number(end[2]);
  // Allow overnight shifts. A duration above 16 hours needs manual review.
  const minutes = (endMinutes - startMinutes + 1440) % 1440;
  return minutes > 0 && minutes <= 960 ? minutes / 60 : 0;
}

/** Summarise attendance records for one employee in a month */
export function summariseAttendance(records = []) {
  let present = 0;
  let absent = 0;
  let late = 0;
  let halfDay = 0;
  let vacation = 0;
  let totalHours = 0;
  let accountableDays = 0;

  safeArray(records).forEach(r => {
    if (!r) return;

    totalHours += toNumber(r.hours_worked) || calcHours(r.check_in, r.check_out);

    if (r.status === 'present') {
      present++;
      accountableDays++;
    } else if (r.status === 'late') {
      late++;
      present++;
      accountableDays++;
    } else if (r.status === 'absent') {
      absent++;
      accountableDays++;
    } else if (r.status === 'half_day') {
      halfDay++;
      present += 0.5;
      accountableDays++;
    } else if (r.status === 'vacation') {
      vacation++;
    }
  });

  return { present, absent, late, halfDay, vacation, totalHours, accountableDays };
}

/**
 * Calculate deductions for an employee based on attendance + rules
 * @param {object} summary - from summariseAttendance
 * @param {number} baseSalary
 * @param {number} workingDaysInMonth - typically 26 or 30
 * @param {Array} rules - DeductionRule records
 * @returns {number} total deduction amount
 */
export function calcDeductions(summary = {}, baseSalary = 0, workingDaysInMonth = 26, rules = [], attendanceRecords = []) {
  const safeBaseSalary = Math.max(0, toNumber(baseSalary));
  const safeWorkingDays = toNumber(workingDaysInMonth);
  const dailySalary = safeWorkingDays > 0 ? safeBaseSalary / safeWorkingDays : 0;
  let total = 0;

  safeArray(rules).forEach(rule => {
    if (!rule) return;
    const ruleType = rule.applies_to || rule.type;
    const occurrences = ruleType === 'absent' ? toNumber(summary.absent)
      : ruleType === 'half_day' ? toNumber(summary.halfDay)
      : ruleType === 'late'
        ? (safeArray(attendanceRecords).length
          ? safeArray(attendanceRecords).filter(record => record?.status === 'late'
            && toNumber(record?.late_minutes) > toNumber(rule.late_threshold ?? 15)).length
          : toNumber(summary.late))
        : 0;
    if (occurrences <= 0) return;

    let perOccurrence = 0;
    if (rule.deduction_type === 'fixed') {
      perOccurrence = Math.max(0, toNumber(rule.amount));
    } else if (rule.deduction_type === 'daily_fraction') {
      // The DB stores the fraction in "amount" (there is no "fraction" column).
      // Reject invalid legacy entries such as 50 instead of multiplying salary 50x.
      const fraction = toNumber(rule.fraction ?? rule.amount);
      if (fraction <= 0 || fraction > 1) return;
      perOccurrence = dailySalary * fraction;
    }
    total += perOccurrence * occurrences;
  });

  return Math.min(safeBaseSalary, Math.max(0, Math.round(total * 100) / 100));
}

/**
 * Build full payroll row for a single employee in a given month
 */
export function buildPayrollRow(employee = {}, attendanceRecords = [], bonuses = [], advances = [], rules = [], workingDaysInMonth = 26) {
  const safeAttendanceRecords = safeArray(attendanceRecords);
  const safeBonuses = safeArray(bonuses);
  const safeAdvances = safeArray(advances);
  const baseSalary = Math.max(0, toNumber(employee.base_salary ?? employee.salary));
  const summary = summariseAttendance(safeAttendanceRecords);
  const scopedRules = safeArray(rules).filter(rule => (!rule.restaurant_id || rule.restaurant_id === employee.restaurant_id) && (!rule.branch_id || rule.branch_id === employee.branch_id));
  const deductions = calcDeductions(summary, baseSalary, workingDaysInMonth, scopedRules, safeAttendanceRecords);
  const totalBonuses = safeBonuses.reduce((s, b) => s + toNumber(b?.amount), 0);
  const totalAdvances = safeAdvances.reduce((s, a) => s + toNumber(a?.amount), 0);
  const finalSalary = Math.max(0, Math.round((baseSalary + totalBonuses - deductions - totalAdvances) * 100) / 100);
  const attendanceRate = summary.accountableDays > 0
    ? clamp(Math.round((summary.present / summary.accountableDays) * 100))
    : 0;

  return {
    employee_id: employeeKey(employee),
    employee_name: employee.full_name || employee.employee_name || '',
    branch: employee.branch || 'unassigned',
    base_salary: baseSalary,
    bonuses: totalBonuses,
    deductions,
    advances: totalAdvances,
    final_salary: finalSalary,
    present_days: summary.present,
    absent_days: summary.absent,
    late_days: summary.late,
    total_hours: summary.totalHours,
    attendance_rate: attendanceRate,
  };
}

/** Month string helpers */
export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function monthRange(month) {
  const safeMonth = typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) ? month : currentMonth();
  const [y, m] = safeMonth.split('-').map(Number);
  const from = `${safeMonth}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${safeMonth}-${String(last).padStart(2, '0')}`;
  return { from, to };
}
