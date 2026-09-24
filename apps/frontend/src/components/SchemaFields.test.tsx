// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { FormProvider, useForm } from 'react-hook-form';
import { z } from 'zod';
import { SchemaFields } from './SchemaFields';
afterEach(cleanup);
function Fixture() {
  const form = useForm({ defaultValues: { name: '', fields: [] as { name: string }[] } });
  return (
    <FormProvider {...form}>
      <SchemaFields
        schema={z.object({ name: z.string(), fields: z.array(z.object({ name: z.string() })) })}
      />
    </FormProvider>
  );
}
describe('formulaires dynamiques', () => {
  it('affiche les libellés et permet d’ajouter et retirer un champ', () => {
    render(<Fixture />);
    expect(screen.getByLabelText('Nom')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ajouter/ }));
    expect(screen.getAllByLabelText('Nom')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
    expect(screen.getAllByLabelText('Nom')).toHaveLength(1);
  });
  it('conserve les saisies existantes lors de l’ajout d’un élément', () => {
    render(<Fixture />);
    const add = screen.getByRole('button', { name: /Ajouter/ });
    fireEvent.click(add);
    fireEvent.change(screen.getAllByLabelText('Nom')[1]!, { target: { value: 'premier' } });
    fireEvent.click(add);
    fireEvent.change(screen.getAllByLabelText('Nom')[2]!, { target: { value: 'second' } });
    fireEvent.click(add);
    const inputs = screen.getAllByLabelText('Nom') as HTMLInputElement[];
    expect(inputs.map((input) => input.value)).toEqual(['', 'premier', 'second', '']);
    fireEvent.click(screen.getAllByRole('button', { name: /Retirer/ })[0]!);
    const remaining = screen.getAllByLabelText('Nom') as HTMLInputElement[];
    expect(remaining.map((input) => input.value)).toEqual(['', 'second', '']);
  });
});
