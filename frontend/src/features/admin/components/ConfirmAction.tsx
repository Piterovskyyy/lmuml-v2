import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmAction({
  label,
  title = `${label}?`,
  description,
  busy,
  destructive = false,
  onConfirm,
}: {
  label: string;
  title?: string;
  description: string;
  busy: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={busy}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Anuluj
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={onConfirm}
            >
              {label}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
