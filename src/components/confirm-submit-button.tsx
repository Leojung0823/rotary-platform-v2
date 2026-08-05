"use client";

import type { ComponentProps } from "react";

export function ConfirmSubmitButton({ confirmMessage, ...props }: ComponentProps<"button"> & { confirmMessage: string }) {
  return <button
    {...props}
    onClick={(event) => {
      if (!window.confirm(confirmMessage)) event.preventDefault();
    }}
  />;
}
