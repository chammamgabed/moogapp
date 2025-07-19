from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.gridlayout import GridLayout
from kivy.uix.textinput import TextInput
from kivy.uix.image import AsyncImage
from kivy.uix.label import Label
from kivy.uix.button import Button
from kivy.uix.scrollview import ScrollView
from kivy.uix.scatter import Scatter
from kivy.uix.popup import Popup
from kivy.core.clipboard import Clipboard
from kivy.utils import platform
from kivy.clock import Clock
from kivy.metrics import dp
from kivy.core.window import Window
from kivy.graphics import Color, Rectangle
import json
import os
import re
import difflib
import unicodedata
import string

Window.clearcolor = (1, 1, 1, 1)

# ------------------------------------------------------------------
# مسار ملف البيانات
# ------------------------------------------------------------------
if platform == 'android':
    try:
        from android.storage import app_storage_path
        CHEMIN_FICHIER = os.path.join(app_storage_path(), "data.json")
    except ImportError:
        CHEMIN_FICHIER = "data.json"
else:
    CHEMIN_FICHIER = "data.json"


def charger_donnees():
    if os.path.exists(CHEMIN_FICHIER):
        try:
            with open(CHEMIN_FICHIER, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def sauvegarder_donnees(donnees):
    with open(CHEMIN_FICHIER, "w", encoding="utf-8") as f:
        json.dump(donnees, f, indent=2, ensure_ascii=False)


BASE_DE_DONNEES = charger_donnees()


# ------------------------------------------------------------------
# أدوات تنظيف للبحث
# ------------------------------------------------------------------
def _normaliser_mot(m):
    """تنظيف كلمة بحث: إزالة مسافات غريبة، ترميز صغير، حذف علامات ترقيم على الأطراف."""
    if not m:
        return ""
    m = "".join(" " if unicodedata.category(ch).startswith("Z") else ch for ch in m)
    m = m.strip()
    m = m.strip(string.punctuation + " \t\r\n")
    return m.lower()


def _prep(txt):
    """نسخة مبسطة من النص للمطابقة التقريبية."""
    return " ".join(txt.lower().split())


def _score_item(item, mots_clean):
    ref = item.get("ref", "") or ""
    desc = item.get("description", "") or ""

    ref_p = _prep(ref)
    desc_p = _prep(desc)
    full_p = ref_p + " " + desc_p

    if not mots_clean:
        return 0.0

    mots_set = set(mots_clean)
    couverture = 0.0
    for m in mots_set:
        if m in full_p:
            couverture += 1.0
        else:
            ratio_ref = difflib.SequenceMatcher(None, m, ref_p).ratio()
            ratio_desc = difflib.SequenceMatcher(None, m, desc_p).ratio()
            if max(ratio_ref, ratio_desc) >= 0.6:
                couverture += 0.5
    couverture /= len(mots_set)

    ratio_ref_full = difflib.SequenceMatcher(None, " ".join(mots_clean), ref_p).ratio()
    ratio_full = difflib.SequenceMatcher(None, " ".join(mots_clean), full_p).ratio()
    score = (couverture * 0.5) + (ratio_ref_full * 0.3) + (ratio_full * 0.2)
    return score


# ------------------------------------------------------------------
# Widget نتيجة واحدة (بطاقة)
# ------------------------------------------------------------------
class ResultItem(BoxLayout):
    def __init__(self, parent, ref, description, image_url, mots_recherche=None, **kwargs):
        super().__init__(orientation='vertical',
                         size_hint_y=None,
                         spacing=dp(8),
                         padding=dp(8),
                         **kwargs)

        self.parent_app = parent
        self.ref = ref
        self.image_url = image_url.strip() if image_url else ""
        self.mots_recherche = mots_recherche or []

        btn_supprimer = Button(
            text="Supprimer",
            size_hint=(None, None),
            size=(dp(120), dp(40)),
            font_size=dp(18),
            background_color=(0.8, 0, 0, 1),
            color=(1, 1, 1, 1),
            pos_hint={"right": 1}
        )
        btn_supprimer.bind(on_press=self.confirmer_suppression)
        self.add_widget(btn_supprimer)

        if self.image_url:
            self.img = AsyncImage(source=self.image_url,
                                  allow_stretch=True,
                                  keep_ratio=True,
                                  size_hint_y=None,
                                  height=dp(220))
            self.img.bind(on_touch_down=self.open_fullscreen)
        else:
            self.img = Label(
                text="[i]Pas d'image[/i]",
                markup=True,
                size_hint_y=None,
                height=dp(220),
                color=(0, 0, 0, 1),
                font_size=dp(20),
                halign='center',
                valign='middle'
            )
        self.add_widget(self.img)

        text_layout = BoxLayout(orientation='vertical',
                                size_hint_y=None,
                                spacing=dp(5),
                                padding=[dp(5), dp(5), dp(5), dp(5)])
        text_layout.bind(minimum_height=text_layout.setter('height'))

        self.label_ref = Label(
            text=self._highlight_text(f"Référence : {ref}", self.mots_recherche),
            markup=True,
            size_hint_y=None,
            height=dp(35),
            font_size=dp(20),
            halign='left',
            valign='middle'
        )
        self.label_ref.bind(texture_size=self._update_label_size(self.label_ref))

        self.label_desc = Label(
            text=self._highlight_text(description, self.mots_recherche),
            markup=True,
            size_hint_y=None,
            font_size=dp(20),
            halign='left',
            valign='top'
        )
        self.label_desc.bind(texture_size=self._update_label_size(self.label_desc))

        text_layout.add_widget(self.label_ref)
        text_layout.add_widget(self.label_desc)
        self.add_widget(text_layout)

        Clock.schedule_once(self._finalize_sizes, 0)

    def _highlight_text(self, text, mots_raw):
        if not text:
            return ""
        safe = text.replace('[', '(').replace(']', ')')
        mots_clean = []
        for m in mots_raw or []:
            mm = _normaliser_mot(m)
            if mm and mm not in mots_clean:
                mots_clean.append(mm)
        if not mots_clean:
            return f"[color=000000]{safe}[/color]"
        pattern = re.compile("(" + "|".join(re.escape(m) for m in mots_clean) + ")", re.IGNORECASE)

        def repl(match):
            chunk = match.group(0)
            return f"[color=3399ff]{chunk}[/color][color=000000]"

        highlighted = pattern.sub(repl, safe)
        return f"[color=000000]{highlighted}[/color]"

    def _update_label_size(self, widget):
        def updater(instance, *args):
            instance.text_size = (self.width - dp(30), None)
            instance.height = instance.texture_size[1] + dp(10)
        return updater

    def _finalize_sizes(self, *_):
        width_avail = self.width - dp(30)
        for w in (self.label_ref, self.label_desc):
            w.text_size = (width_avail, None)
            w.texture_update()
            w.height = w.texture_size[1] + dp(10)
        total = 0
        for child in self.children:
            total += child.height + self.spacing
        total += self.padding[1] + self.padding[3]
        self.height = total

    def open_fullscreen(self, instance, touch):
        if not self.image_url:
            return False
        if instance.collide_point(*touch.pos):
            scatter_full = Scatter(do_rotation=False,
                                   do_translation=True,
                                   do_scale=True)
            scatter_full.scale_min = 1
            scatter_full.scale_max = 6
            img_full = AsyncImage(source=self.image_url,
                                  allow_stretch=True,
                                  keep_ratio=True)
            img_full.size_hint = (None, None)
            img_full.size = (Window.width * 2, Window.height * 2)
            scatter_full.add_widget(img_full)
            popup_full = Popup(title="Image complète (Zoom)",
                               content=scatter_full,
                               size_hint=(1, 1))
            popup_full.open()
            return True
        return False

    def confirmer_suppression(self, instance):
        box = BoxLayout(orientation='vertical', spacing=dp(20), padding=dp(20))
        lbl = Label(text=f"Supprimer cet élément ?\n\n[b]{self.ref}[/b]",
                    markup=True, color=(0, 0, 0, 1), font_size=dp(24))
        box.add_widget(lbl)
        hbtn = BoxLayout(orientation='horizontal', spacing=dp(20),
                         size_hint_y=None, height=dp(60))
        btn_non = Button(text="Non", background_color=(0.5, 0.5, 0.5, 1),
                         color=(1, 1, 1, 1), font_size=dp(22))
        btn_oui = Button(text="Oui", background_color=(0.8, 0, 0, 1),
                         color=(1, 1, 1, 1), font_size=dp(22))
        hbtn.add_widget(btn_non)
        hbtn.add_widget(btn_oui)
        box.add_widget(hbtn)
        popup_confirm = Popup(title="Confirmation", content=box,
                              size_hint=(0.8, 0.4), auto_dismiss=False)
        btn_non.bind(on_press=lambda *_: popup_confirm.dismiss())
        btn_oui.bind(on_press=lambda *_: (popup_confirm.dismiss(), self.supprimer_item()))
        popup_confirm.open()

    def supprimer_item(self):
        global BASE_DE_DONNEES
        BASE_DE_DONNEES = [item for item in BASE_DE_DONNEES if item["ref"] != self.ref]
        sauvegarder_donnees(BASE_DE_DONNEES)
        self.parent_app.effectuer_recherche(None)


# ------------------------------------------------------------------
# التطبيق الرئيسي
# ------------------------------------------------------------------
class OscaroSearchApp(App):
    def build(self):
        self.root = BoxLayout(orientation='vertical', padding=dp(15), spacing=dp(15))
        title = Label(text="[b]Recherche de pièce détachée[/b]",
                      markup=True, font_size=dp(28),
                      size_hint_y=None, height=dp(50),
                      color=(0, 0, 0, 1))
        self.root.add_widget(title)
        self.input_search = TextInput(
            hint_text="Numéro de pièce (copier / coller)",
            font_size=dp(24),
            multiline=False,
            padding=[dp(10), dp(15), dp(10), dp(15)],
            background_color=(0.95, 0.95, 0.95, 1),
            foreground_color=(0, 0, 0, 1),
            cursor_color=(0, 0, 0, 1),
            size_hint_y=None,
            height=dp(65)
        )
        self.root.add_widget(self.input_search)
        self.btn_enregistrer = Button(
            text="Enregistrer",
            font_size=dp(22),
            size_hint_y=None,
            height=dp(55),
            background_color=(0, 0.7, 0.2, 1),
            color=(1, 1, 1, 1)
        )
        self.btn_enregistrer.bind(on_press=self.popup_enregistrement)
        self.root.add_widget(self.btn_enregistrer)
        self.btn_search = Button(
            text="Chercher",
            font_size=dp(22),
            size_hint_y=None,
            height=dp(55),
            background_color=(0.2, 0.6, 1, 1),
            color=(1, 1, 1, 1)
        )
        self.btn_search.bind(on_press=self.effectuer_recherche)
        self.root.add_widget(self.btn_search)
        self.scroll = ScrollView(size_hint=(1, 1),
                                 do_scroll_x=False,
                                 do_scroll_y=True,
                                 bar_width=dp(10))
        self.resultats_layout = GridLayout(cols=1,
                                           spacing=dp(10),
                                           size_hint_y=None,
                                           padding=[0, dp(10), 0, dp(10)])
        self.resultats_layout.bind(minimum_height=self.resultats_layout.setter('height'))
        self.scroll.add_widget(self.resultats_layout)
        self.root.add_widget(self.scroll)
        return self.root

    def effectuer_recherche(self, instance):
        texte_recherche = self.input_search.text
        self.resultats_layout.clear_widgets()
        if not texte_recherche.strip():
            self._afficher_message("Veuillez entrer une référence à rechercher.")
            return
        mots_raw = texte_recherche.split()
        mots_clean = [_normaliser_mot(m) for m in mots_raw if _normaliser_mot(m)]
        if not mots_clean:
            self._afficher_message("Veuillez entrer une référence valide.")
            return
        resultats_strict = []
        for item in BASE_DE_DONNEES:
            full = (item.get("ref", "") + " " + item.get("description", "")).lower()
            if all(m in full for m in mots_clean):
                resultats_strict.append(item)
        if resultats_strict:
            for item in resultats_strict:
                widget_result = ResultItem(
                    self,
                    item.get("ref", ""),
                    item.get("description", ""),
                    item.get("image", ""),
                    mots_recherche=mots_raw
                )
                self.resultats_layout.add_widget(widget_result)
            return
        scored = []
        for item in BASE_DE_DONNEES:
            s = _score_item(item, mots_clean)
            if s > 0:
                scored.append((s, item))
        if not scored:
            self._afficher_message("Aucun résultat (recherche intelligente: 0).")
            return
        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:20]
        self._afficher_message("Résultats suggérés (recherche intelligente) :")
        for score, item in top:
            widget_result = ResultItem(
                self,
                item.get("ref", ""),
                item.get("description", ""),
                item.get("image", ""),
                mots_recherche=mots_raw
            )
            self.resultats_layout.add_widget(widget_result)

    def _afficher_message(self, texte):
        lbl = Label(
            text=texte,
            font_size=dp(20),
            size_hint_y=None,
            height=dp(60),
            color=(0.5, 0.5, 0.5, 1),
            halign='center',
            valign='middle'
        )
        lbl.bind(texture_size=lambda *_: setattr(lbl, 'height', lbl.texture_size[1] + dp(20)))
        self.resultats_layout.add_widget(lbl)

    def popup_enregistrement(self, instance):
        layout = BoxLayout(orientation='vertical', spacing=10, padding=10)
        layout.add_widget(Label(text="Ajouter une pièce :", font_size=dp(32), color=(0, 0, 0, 1)))
        hbox_ref = BoxLayout(orientation='horizontal', size_hint_y=None, height=dp(140), spacing=dp(10))
        input_ref = TextInput(
            hint_text="Numéro de pièce",
            multiline=True,
            font_size=dp(32),
            foreground_color=(0, 0, 0, 1),
            background_color=(1, 1, 1, 1)
        )
        btn_paste = Button(
            text="Coller",
            size_hint_x=None,
            width=dp(100),
            height=dp(140),
            font_size=dp(20)
        )

        def on_paste(_):
            pasted = Clipboard.paste()
            if input_ref.text.strip():
                input_ref.text += " " + pasted
            else:
                input_ref.text = pasted
        btn_paste.bind(on_press=on_paste)
        hbox_ref.add_widget(input_ref)
        hbox_ref.add_widget(btn_paste)
        layout.add_widget(hbox_ref)
        input_desc = TextInput(
            hint_text="Description",
            multiline=True,
            font_size=dp(32),
            foreground_color=(0, 0, 0, 1),
            background_color=(1, 1, 1, 1),
            size_hint_y=None,
            height=dp(140)
        )
        layout.add_widget(input_desc)
        input_img = TextInput(
            hint_text="Lien image (URL) (optionnel)",
            multiline=False,
            font_size=dp(28),
            foreground_color=(0, 0, 0, 1),
            background_color=(1, 1, 1, 1)
        )
        layout.add_widget(input_img)
        btn_valider = Button(
            text="Valider",
            font_size=dp(28),
            size_hint_y=None,
            height=dp(60),
            background_color=(0, 0.5, 0.2, 1),
            color=(1, 1, 1, 1)
        )

        def enregistrer(_):
            ref = input_ref.text.strip()
            desc = input_desc.text.strip()
            img = input_img.text.strip()
            if ref and desc:
                global BASE_DE_DONNEES
                BASE_DE_DONNEES = charger_donnees()
                BASE_DE_DONNEES.append({
                    "ref": ref,
                    "description": desc,
                    "image": img if img else ""
                })
                sauvegarder_donnees(BASE_DE_DONNEES)
                self.input_search.text = ref + " " + desc
                self.effectuer_recherche(None)
                popup.dismiss()

        btn_valider.bind(on_press=enregistrer)
        layout.add_widget(btn_valider)
        popup = Popup(title="Ajouter une pièce", content=layout, size_hint=(0.9, 0.9))
        popup.open()
        Clock.schedule_once(lambda dt: setattr(input_ref, 'focus', True), 0.1)


# ------------------------------------------------------------------
# تشغيل التطبيق
# ------------------------------------------------------------------
if __name__ == '__main__':
    OscaroSearchApp().run()
