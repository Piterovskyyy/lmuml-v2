package pl.lmuml.player;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
import org.springframework.util.Assert;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(name = "lmuml.player.password-reset.enabled", havingValue = "true")
final class PlayerPasswordResetMail {

    private final JavaMailSender sender;
    private final String from;

    PlayerPasswordResetMail(JavaMailSender sender, @Value("${lmuml.player.password-reset.from}") String from) {
        Assert.hasText(from, "Set lmuml.player.password-reset.from to the SMTP sender address");
        this.sender = sender;
        this.from = from;
    }

    void send(String email, String resetUrl) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Ustaw nowe hasło do LMuML");
        message.setText("""
                Aby ustawić nowe hasło do LMuML, otwórz poniższy jednorazowy link.

                %s

                Jeśli to nie Twoja prośba, zignoruj tę wiadomość.
                """.formatted(resetUrl));
        sender.send(message);
    }
}
