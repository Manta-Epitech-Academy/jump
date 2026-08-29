import { describe, it, expect } from 'vitest';
import { can, describeGroup, INVITABLE_STAFF_ROLES } from './permissions';

describe('Staff Group Permissions Domain Logic', () => {
  describe('can helper', () => {
    it('grants devMember access to dev and superdev roles', () => {
      expect(can('devMember', 'dev')).toBe(true);
      expect(can('devMember', 'superdev')).toBe(true);
    });

    it('denies devMember access to admin, student, and null roles', () => {
      // Admins carry no campus, so they reach the dev space only by
      // impersonating a dev (that session resolves to role 'dev'), never with
      // their own session: see STAFF_GROUPS.devMember in permissions.ts.
      expect(can('devMember', 'admin')).toBe(false);
      expect(can('devMember', 'student' as any)).toBe(false);
      expect(can('devMember', 'parent' as any)).toBe(false);
      expect(can('devMember', null)).toBe(false);
      expect(can('devMember', undefined)).toBe(false);
    });

    it('restricts realSendArmers strictly to admin', () => {
      expect(can('realSendArmers', 'admin')).toBe(true);
      expect(can('realSendArmers', 'superdev')).toBe(false);
      expect(can('realSendArmers', 'dev')).toBe(false);
      expect(can('realSendArmers', 'student' as any)).toBe(false);
      expect(can('realSendArmers', null)).toBe(false);
    });
  });

  describe('describeGroup helper', () => {
    it('returns user-facing French group descriptions', () => {
      const devDesc = describeGroup('devMember');
      expect(devDesc.label).toBe('Équipe dev');
      expect(devDesc.contact).toContain('dev');

      const adminDesc = describeGroup('realSendArmers');
      expect(adminDesc.label).toBe('Admin');
    });
  });

  describe('INVITABLE_STAFF_ROLES', () => {
    it('contains superdev and dev roles only', () => {
      expect(INVITABLE_STAFF_ROLES).toContain('superdev');
      expect(INVITABLE_STAFF_ROLES).toContain('dev');
      expect(INVITABLE_STAFF_ROLES).not.toContain('admin');
    });
  });
});
