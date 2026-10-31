import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { PaymentProviderCallbackDto } from "./dto/payment-provider-callback.dto";
import { PaymentProviderGuard } from "./payment-provider.guard";
import { PaymentsService } from "./payments.service";

/**
 * Endpoint appelé par le mécanisme de paiement (opérateur mobile-money, banque,
 * service de rapprochement). Aucune session utilisateur : l'authentification est
 * la signature HMAC du corps de la requête.
 */
@ApiTags("Confirmations du mécanisme de paiement")
@Controller("paiements")
export class PaymentProviderController {
  constructor(private readonly payments: PaymentsService) {}

  @Post("confirmations")
  @UseGuards(PaymentProviderGuard)
  @ApiOperation({
    summary: "Notification signée du mécanisme de paiement.",
    description:
      "CONFIRME → le paiement passe à CONFIRME et le reçu est généré automatiquement. ECHEC → clôture sans reçu. Traitement idempotent.",
  })
  @ApiHeader({
    name: "x-sre-signature",
    required: true,
    description: "HMAC-SHA256 hexadécimal du corps brut, secret PAYMENT_WEBHOOK_SECRET.",
  })
  @ApiResponse({ status: 201, description: "Notification traitée." })
  @ApiResponse({ status: 401, description: "Signature absente ou invalide." })
  @ApiResponse({ status: 503, description: "Confirmation non configurée (secret absent)." })
  callback(@Body() data: PaymentProviderCallbackDto) {
    return this.payments.handleProviderCallback(data);
  }
}
