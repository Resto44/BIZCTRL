import {it,expect} from 'vitest';
import {attendanceDistance} from '../src/lib/attendanceDistance';
it('uses meters below a kilometer and kilometers at and above it, preserving unknown',()=>{
 expect(attendanceDistance(null)).toBe('—');expect(attendanceDistance('bad')).toBe('—');
 expect(attendanceDistance(12.4)).toBe('12 m');expect(attendanceDistance(1000)).toBe('1.00 km');
 expect(attendanceDistance(1523)).toBe('1.52 km');
});
