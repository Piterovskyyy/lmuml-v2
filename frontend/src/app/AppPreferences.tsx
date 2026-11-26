import { Accessibility, Eye, Settings2, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function AppPreferences({
  comfort,
  onComfortChange,
  backgroundMotion,
  onBackgroundMotionChange,
  reduceMotion,
}: {
  comfort: boolean;
  onComfortChange: (comfort: boolean) => void;
  backgroundMotion: boolean;
  onBackgroundMotionChange: (enabled: boolean) => void;
  reduceMotion: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="settings-trigger">
          <Settings2 aria-hidden="true" />
          <span>Wygląd</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="preferences-dialog">
        <DialogHeader>
          <span className="dialog-emblem">
            <SlidersHorizontal aria-hidden="true" />
          </span>
          <DialogTitle>Wygodnie po Twojemu</DialogTitle>
          <DialogDescription>
            Dopasuj czytelność. Wszystkie funkcje pozostają w tym samym miejscu.
          </DialogDescription>
        </DialogHeader>
        <label className="preference-row" htmlFor="comfort-mode">
          <Accessibility aria-hidden="true" />
          <span>
            <strong>Widok komfortowy</strong>
            <span>Większy tekst, więcej miejsca i spokojniejsze animacje.</span>
          </span>
          <Switch id="comfort-mode" checked={comfort} onCheckedChange={onComfortChange} />
        </label>
        <label className="preference-row" htmlFor="background-motion">
          <Sparkles aria-hidden="true" />
          <span>
            <strong>Animacja tła</strong>
            <span>
              {reduceMotion
                ? comfort
                  ? "Ruch wyłączony w widoku komfortowym."
                  : "Ruch wyłączony przez ustawienia systemowe."
                : "Delikatne smugi światła płyną po krawędziach piłki."}
            </span>
          </span>
          <Switch
            id="background-motion"
            checked={backgroundMotion && !reduceMotion}
            onCheckedChange={onBackgroundMotionChange}
            disabled={reduceMotion}
          />
        </label>
        <p className="preference-note">
          <Eye aria-hidden="true" size={18} /> Ustawienie zapamiętamy w tej przeglądarce.
          Respektujemy też systemowe ograniczenie ruchu.
        </p>
        <DialogClose asChild>
          <Button className="w-full">
            <X aria-hidden="true" />
            <span className="translate-y-px">Gotowe</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
