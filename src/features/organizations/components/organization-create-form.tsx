"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createOrganizationAction } from "@/features/organizations/actions/organization-admin-actions";
import {
  isValidOrganizationName,
  isValidOrganizationSlug,
  normalizeOrganizationName,
  normalizeOrganizationSlug,
} from "@/features/organizations/domain/organization";

export function OrganizationCreateForm() {
  const router = useRouter();
  const submitting = useRef(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [nameError, setNameError] = useState("");
  const [slugError, setSlugError] = useState("");
  const [formError, setFormError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;

    const normalizedName = normalizeOrganizationName(name);
    const nextNameError = isValidOrganizationName(normalizedName)
      ? ""
      : "Organization name must be between 1 and 120 characters.";
    const nextSlugError = isValidOrganizationSlug(slug)
      ? ""
      : "Use 1–120 lowercase letters, numbers, and single hyphens.";
    setNameError(nextNameError);
    setSlugError(nextSlugError);
    setFormError("");
    if (nextNameError || nextSlugError) return;

    submitting.current = true;
    setPending(true);
    try {
      const result = await createOrganizationAction({
        name: normalizedName,
        slug,
      });
      if (!result.ok) {
        if (result.code === "DUPLICATE_SLUG") setSlugError(result.error);
        else setFormError(result.error);
        submitting.current = false;
        setPending(false);
        return;
      }
      router.push(
        `/system-administration/organizations/${result.data.id}?created=1`,
      );
    } catch {
      setFormError("Unable to create organization. Please retry.");
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="organization-name">Organization name</Label>
        <Input
          id="organization-name"
          value={name}
          maxLength={120}
          autoComplete="organization"
          disabled={pending}
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? "organization-name-error" : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setName(next);
            setNameError("");
            if (!slugEdited) setSlug(normalizeOrganizationSlug(next));
          }}
        />
        {nameError ? (
          <p
            id="organization-name-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {nameError}
          </p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="organization-slug">Organization slug</Label>
        <Input
          id="organization-slug"
          value={slug}
          maxLength={120}
          disabled={pending}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={Boolean(slugError)}
          aria-describedby={
            slugError ? "organization-slug-error" : "organization-slug-help"
          }
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
            setSlugError("");
          }}
        />
        <p
          id="organization-slug-help"
          className="text-muted-foreground text-sm"
        >
          You can edit this before creation. The slug cannot be changed later.
        </p>
        {slugError ? (
          <p
            id="organization-slug-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {slugError}
          </p>
        ) : null}
      </div>
      {formError ? (
        <p role="alert" className="text-destructive text-sm">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create Organization"}
      </Button>
    </form>
  );
}
