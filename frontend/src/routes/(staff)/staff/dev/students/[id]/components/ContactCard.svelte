<script lang="ts">
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import StudentContactDetails from '$lib/components/students/StudentContactDetails.svelte';
  import type { ContactPerson } from '$lib/domain/contact';

  type Student = {
    id: string;
    prenom?: string | null;
    nom?: string | null;
    civilite?: string | null;
    user?: { email?: string | null } | null;
    phone?: string | null;
    parentCivilite?: string | null;
    parentNom?: string | null;
    parentPrenom?: string | null;
    parentEmail?: string | null;
    parentPhone?: string | null;
  };

  let { student }: { student: Student } = $props();

  // The talent's login-account email (bauth_user), the source of truth.
  const eleve = $derived<ContactPerson>({
    civilite: student.civilite,
    prenom: student.prenom,
    nom: student.nom,
    email: student.user?.email ?? null,
    phone: student.phone,
  });

  // One guardian on file here (parent-1); dropped entirely when nothing is set
  // so the renderer shows "Aucune information renseignée".
  const guardians = $derived(
    [
      {
        civilite: student.parentCivilite,
        prenom: student.parentPrenom,
        nom: student.parentNom,
        email: student.parentEmail,
        phone: student.parentPhone,
      },
    ].filter(
      (g) => g.prenom || g.nom || g.email || g.phone,
    ) satisfies ContactPerson[],
  );
</script>

<EpiSection title="Coordonnées" accent="blue">
  <StudentContactDetails student={eleve} {guardians} layout="split" />
</EpiSection>
